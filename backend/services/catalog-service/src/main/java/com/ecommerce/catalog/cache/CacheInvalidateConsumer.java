package com.ecommerce.catalog.cache;

import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.ecommerce.catalog.config.RabbitMqConfig;
import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Invalidate cache Redis khi product đổi (plan Task 7, Conventions #6): queue
 * {@code q.catalog.product-changed.cache} (riêng với indexer — Task 5) bind
 * cùng routing key {@code product.changed} trên exchange {@code
 * ecommerce.events}. Idempotent như indexer: marker
 * {@link IdempotentConsumer#tryConsume} CÙNG tx listener.
 *
 * <p>Envelope parse giống {@code ProductIndexer} (raw String + ObjectMapper —
 * một pattern duy nhất cho consumer, tránh converter drift). Marker
 * idempotency có prefix {@code cache:} — CÙNG eventId được deliver cho 2
 * queue (indexer + cache); marker {@code IdempotentConsumer} là global theo
 * messageId nên KHÔNG prefix = consumer nào poll trước "ăn đâu" marker, queue
 * kia skip mất event (bug thật gặp ở IT: indexer bị cache ăn marker DELETED
 * → doc ES kềm mãi). Prefix = idempotency per consumer-group.</p>
 *
 * <p><strong>CHỈ xóa product keys</strong> {@code cat:prod:{slugVi}:*} +
 * {@code cat:prod:{slugEn}:*} (mọi locale, SCAN không KEYS): category tree
 * chỉ đổi khi write category, mà write category KHÔNG emit
 * {@code product.changed} (quyết định T8b) ⇒ xóa {@code cat:cat-tree:*} ở đây
 * là lãng phí — tree stale tự hết TTL 1800s. DELETED cũng xóa key như
 * UPDATED: cache-aside trả DTO cached bất kể DB đã soft-delete ⇒ stale 200
 * tới 600s (chấp nhận "stale-short" Q13), xóa sớm giúp slug đổi tên heal
 * ngay.</p>
 *
 * <p>Lỗi Redis khi xóa → {@code CatalogCacheService.deleteProductKeys} nuốt +
 * WARN (stale tới TTL); message vẫn ack — không requeue (poison-safe, như
 * indexer).</p>
 */
@Component
public class CacheInvalidateConsumer {

    private static final Logger log = LoggerFactory.getLogger(CacheInvalidateConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final CatalogCacheService cache;
    private final ObjectMapper objectMapper;

    public CacheInvalidateConsumer(IdempotentConsumer idempotentConsumer, CatalogCacheService cache,
                                   ObjectMapper objectMapper) {
        this.idempotentConsumer = idempotentConsumer;
        this.cache = cache;
        this.objectMapper = objectMapper;
    }

    @Transactional
    @RabbitListener(queues = RabbitMqConfig.CACHE_QUEUE)
    public void onProductChanged(Message message) {
        try {
            EventEnvelope envelope = objectMapper.readValue(
                new String(message.getBody(), StandardCharsets.UTF_8), EventEnvelope.class);
            if (!RabbitMqConfig.ROUTING_PRODUCT_CHANGED.equals(envelope.eventType())) {
                log.warn("[cache-invalidate] bỏ qua eventType lạ: {}", envelope.eventType());
                return; // không consume marker — queue chỉ bind product.changed, guard giá rẻ
            }
            if (!idempotentConsumer.tryConsume("cache:" + envelope.eventId())) {
                return; // đã xử lý (at-least-once duplicate)
            }
            JsonNode payload = envelope.payload();
            String slugVi = payload.path("slugVi").asText("");
            String slugEn = payload.path("slugEn").asText("");
            if (!slugVi.isBlank()) {
                cache.deleteProductKeys(slugVi);
            }
            // slugEn khác slugVi mới quét pattern thứ hai (slug thường không trùng,
            // nhưng guard để không SCAN 2 lần cùng pattern)
            if (!slugEn.isBlank() && !slugEn.equals(slugVi)) {
                cache.deleteProductKeys(slugEn);
            }
        } catch (Exception e) {
            // Không rethrow → ack. Marker chưa consume nếu parse fail trước
            // tryConsume; fail SAU marker (redis delete) đã nuốt trong
            // deleteProductKeys — tới đây chỉ còn lỗi bất ngờ, ack + stale tới
            // TTL tự heal (K13 stale-short).
            log.error("[cache-invalidate] consume product.changed lỗi — ack (stale tối đa TTL 600s)", e);
        }
    }
}
