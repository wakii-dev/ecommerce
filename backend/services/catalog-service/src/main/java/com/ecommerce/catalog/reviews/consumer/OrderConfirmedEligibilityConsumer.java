package com.ecommerce.catalog.reviews.consumer;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.ecommerce.catalog.config.RabbitMqConfig;
import com.ecommerce.catalog.repo.ReviewEligibilityRepository;
import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Verified-purchase consumer (SF-8, spec Q9): queue
 * {@code q.catalog.order-confirmed.eligibility} bind routing
 * {@code order.confirmed} (fat payload §6.1.5 — items có product_id + user_id,
 * KHÔNG call-back HTTP). Mỗi item → 1 row {@code review_eligibility}
 * (dedupe ON CONFLICT DO NOTHING — mua lại cùng product vẫn 1 row).
 *
 * <p>Pattern {@code CacheInvalidateConsumer}: envelope parse raw String +
 * ObjectMapper (một pattern duy nhất), idempotency marker
 * {@link IdempotentConsumer#tryConsume} CÙNG tx listener, marker prefix
 * {@code elig:} — per consumer-group (memory: 2 queue có thể cùng nhận 1
 * eventId, marker global sẽ "ăn đâu" của queue kia).</p>
 *
 * <p>Poison-safe: envelope/item parse fail hoặc UUID sai → WARN + ack (KHÔNG
 * requeue — event hỏng format không bao giờ tự lành). Lỗi DB tạm thời →
 * rethrow (requeue, at-least-once + marker chịu).</p>
 */
@Component
public class OrderConfirmedEligibilityConsumer {

    private static final Logger log = LoggerFactory.getLogger(OrderConfirmedEligibilityConsumer.class);

    /** Prefix marker idempotency per consumer-group (IdempotentConsumer global theo messageId). */
    static final String MARKER_PREFIX = "elig:";

    private final IdempotentConsumer idempotentConsumer;
    private final ReviewEligibilityRepository eligibilityRepository;
    private final ObjectMapper objectMapper;

    public OrderConfirmedEligibilityConsumer(IdempotentConsumer idempotentConsumer,
                                             ReviewEligibilityRepository eligibilityRepository,
                                             ObjectMapper objectMapper) {
        this.idempotentConsumer = idempotentConsumer;
        this.eligibilityRepository = eligibilityRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    @RabbitListener(queues = RabbitMqConfig.ELIGIBILITY_QUEUE)
    public void onOrderConfirmed(Message message) {
        EventEnvelope envelope;
        try {
            envelope = objectMapper.readValue(
                new String(message.getBody(), StandardCharsets.UTF_8), EventEnvelope.class);
        } catch (Exception e) {
            log.warn("[review-eligibility] envelope parse fail — ack bỏ qua (poison): {}", e.getMessage());
            return;
        }
        if (envelope == null) {
            // body "null" parse ra null — NPE ở dưới sẽ requeue vô hạn (review P1)
            log.warn("[review-eligibility] envelope null — ack bỏ qua (poison)");
            return;
        }
        if (!RabbitMqConfig.ROUTING_ORDER_CONFIRMED.equals(envelope.eventType())) {
            log.warn("[review-eligibility] bỏ qua eventType lạ: {}", envelope.eventType());
            return; // không consume marker — queue chỉ bind order.confirmed
        }
        if (envelope.eventId() == null) {
            // không guard → marker "elig:null" dùng chung cho mọi event hỏng
            log.warn("[review-eligibility] eventId thiếu — ack bỏ qua (poison)");
            return;
        }
        if (!idempotentConsumer.tryConsume(MARKER_PREFIX + envelope.eventId())) {
            return; // đã xử lý (at-least-once duplicate)
        }

        JsonNode payload = envelope.payload();
        if (payload == null || payload.isMissingNode() || !payload.isObject()) {
            log.warn("[review-eligibility] payload thiếu/không phải object — ack bỏ qua eventId={}",
                envelope.eventId());
            return;
        }
        UUID orderId = parseUuid(payload.path("orderId").asText(null), "orderId", envelope);
        UUID userId = parseUuid(payload.path("userId").asText(null), "userId", envelope);
        if (orderId == null || userId == null) {
            return; // đã WARN trong parseUuid — ack bỏ qua
        }
        for (JsonNode item : payload.path("items")) {
            UUID productId = parseUuid(item.path("productId").asText(null), "items[].productId", envelope);
            if (productId == null) {
                continue; // item hỏng không chặn các item khác
            }
            // Mua 2 lần cùng product → 1 row (PK user+product, ON CONFLICT DO NOTHING)
            eligibilityRepository.insertIgnore(userId, productId, orderId);
        }
    }

    private UUID parseUuid(String raw, String field, EventEnvelope envelope) {
        if (raw == null || raw.isBlank()) {
            log.warn("[review-eligibility] {} thiếu — ack bỏ qua eventId={}", field, envelope.eventId());
            return null;
        }
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            log.warn("[review-eligibility] {} không phải UUID: {} — ack bỏ qua eventId={}",
                field, raw, envelope.eventId());
            return null;
        }
    }
}
