package com.ecommerce.catalog.search;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.config.RabbitMqConfig;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Indexer ES (plan Task 5): consume {@code product.changed} từ queue
 * {@value RabbitMqConfig#INDEXER_QUEUE} — idempotent
 * ({@link IdempotentConsumer}, marker CÙNG tx listener) → CREATED/UPDATED
 * re-load entity (published → index, draft/soft-delete → delete doc);
 * DELETED → delete doc. Doc build per-locale 1 nguồn duy nhất
 * {@link #buildDoc} (EsEngine.index/reindexAll dùng chung — không nhân bản).
 *
 * <p><strong>Tradeoff ES-call trong tx (D15 + review P2 group 3):</strong> ES
 * index/delete KHÔNG transactional — fail → log ERROR, KHÔNG rethrow (marker
 * vẫn consume, message ack): rethrow = requeue vô hạn nếu index mapping lệch
 * (poison); startup reindex + event sau sẽ heal. Nhận marker mất khi ES chết
 * đúng lúc consume — chấp nhận, reindexAll bù.</p>
 */
@Component
public class ProductIndexer {

    private static final Logger log = LoggerFactory.getLogger(ProductIndexer.class);

    private final SearchEngine searchEngine;
    private final IdempotentConsumer idempotentConsumer;
    private final ProductRepository products;
    private final ObjectMapper objectMapper;

    public ProductIndexer(SearchEngine searchEngine, IdempotentConsumer idempotentConsumer,
                          ProductRepository products, ObjectMapper objectMapper) {
        this.searchEngine = searchEngine;
        this.idempotentConsumer = idempotentConsumer;
        this.products = products;
        this.objectMapper = objectMapper;
    }

    /**
     * Body = EventEnvelope JSON (OutboxWriter wrap — OutboxRelay publish nguyên
     * body). Receive raw String + parse ObjectMapper (DECISION Task 5: tránh
     * converter config drift với services khác trên cùng exchange). Envelope
     * lạ (eventType khác) → skip không consume marker (queue chỉ bind
     * product.changed nhưng guard giá rẻ).
     */
    @Transactional
    @RabbitListener(queues = RabbitMqConfig.INDEXER_QUEUE)
    public void onProductChanged(Message message) {
        try {
            EventEnvelope envelope = objectMapper.readValue(
                new String(message.getBody(), StandardCharsets.UTF_8), EventEnvelope.class);
            if (!RabbitMqConfig.ROUTING_PRODUCT_CHANGED.equals(envelope.eventType())) {
                log.warn("[indexer] bỏ qua eventType lạ: {}", envelope.eventType());
                return;
            }
            if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
                return; // đã xử lý (at-least-once duplicate)
            }
            JsonNode payload = envelope.payload();
            String action = payload.path("action").asText("");
            UUID productId = UUID.fromString(payload.path("productId").asText());
            if ("DELETED".equals(action)) {
                deleteQuietly(productId);
                return;
            }
            // CREATED/UPDATED: re-load entity — outbox row chỉ mang id (schema event)
            products.findById(productId)
                .filter(p -> p.getStatus() == ProductStatus.PUBLISHED && p.getDeletedAt() == null)
                .ifPresentOrElse(this::indexQuietly, () -> deleteQuietly(productId));
        } catch (Exception e) {
            // Không rethrow → ack. Marker chưa consume nếu parse fail (eventID
            // đọc được thì marker đã consume trước business — mọi fail sau đó
            // chỉ mất 1 lần index, reindexAll bù).
            log.error("[indexer] consume product.changed lỗi — ack (không requeue, startup reindex sẽ heal)", e);
        }
    }

    private void indexQuietly(ProductEntity p) {
        try {
            searchEngine.index(p);
        } catch (Exception e) {
            log.error("[indexer] index product {} lỗi — bỏ qua (reindex sẽ heal)", p.getId(), e);
        }
    }

    private void deleteQuietly(UUID productId) {
        try {
            searchEngine.delete(productId.toString());
        } catch (Exception e) {
            log.error("[indexer] delete doc product {} lỗi — bỏ qua (reindex sẽ heal)", productId, e);
        }
    }

    // ── document builder — dùng chung bởi EsEngine.index / reindexAll ────────

    /**
     * Doc theo mapping {@link EsIndexConfig} (plan Task 5): name/description
     * per-locale, categorySlugs = slug vi+en CỦA CẢ PATH ancestor (filter cha
     * thấy hàng con), discount = (compare-price)/compare khi compare > price
     * else 0 (Q9 — sort field index-time), ảnh position 0.
     */
    public static Map<String, Object> buildDoc(ProductEntity p, List<ProductImageEntity> images,
                                               Map<UUID, CategoryEntity> categoriesById) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("productId", p.getId().toString());
        doc.put("name", i18n(p.getName()));
        doc.put("description", i18n(p.getDescription()));
        doc.put("brand", p.getBrand());
        doc.put("categorySlugs", ancestorSlugs(p.getCategoryId(), categoriesById));
        doc.put("price", p.getPrice());
        doc.put("discount", discountRate(p));
        doc.put("ratingAvg", p.getRatingAvg() == null ? 0.0 : p.getRatingAvg().doubleValue());
        doc.put("ratingCount", p.getRatingCount());
        doc.put("official", p.isOfficial());
        doc.put("status", p.getStatus().name());
        doc.put("tags", p.getTags() == null ? List.of() : p.getTags());
        doc.put("slugVi", p.getSlugVi());
        doc.put("slugEn", p.getSlugEn());
        doc.put("flashSaleEndsAt", p.getFlashSaleEndsAt() == null ? null : p.getFlashSaleEndsAt().toString());
        ProductImageEntity first = (images == null || images.isEmpty()) ? null : images.get(0);
        doc.put("imageUrl", first == null ? "" : first.getUrl());
        doc.put("imageAlt", first == null ? p.getName().vi() : first.getAlt());
        doc.put("createdAt", p.getCreatedAt() == null ? null : p.getCreatedAt().toString());
        return doc;
    }

    /** (compare − price) / compare khi compare > price, else 0 — công thức Q9 index-time. */
    public static double discountRate(ProductEntity p) {
        Long compare = p.getComparePrice();
        if (compare == null || compare <= p.getPrice()) {
            return 0.0;
        }
        return (compare - (double) p.getPrice()) / compare;
    }

    private static Map<String, String> i18n(I18nText text) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("vi", text == null ? "" : orEmpty(text.vi()));
        m.put("en", text == null ? "" : orEmpty(text.en()));
        return m;
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    /** Walk parent chain — gom slug_vi + slug_en từng node (thứ tự không quan trọng — keyword[] filter any-of). */
    private static List<String> ancestorSlugs(UUID categoryId, Map<UUID, CategoryEntity> categoriesById) {
        List<String> slugs = new ArrayList<>();
        UUID current = categoryId;
        int depth = 0;
        while (current != null && depth++ < 10) { // 10 = chặn chu kỳ dữ liệu bẩn
            CategoryEntity category = categoriesById.get(current);
            if (category == null) {
                break;
            }
            if (category.getSlugVi() != null) {
                slugs.add(category.getSlugVi());
            }
            if (category.getSlugEn() != null) {
                slugs.add(category.getSlugEn());
            }
            current = category.getParentId();
        }
        return slugs;
    }
}
