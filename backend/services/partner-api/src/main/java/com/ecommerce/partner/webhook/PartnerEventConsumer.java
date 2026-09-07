package com.ecommerce.partner.webhook;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.partner.config.RabbitMqConfig;
import com.ecommerce.partner.domain.DeliveryStatus;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.domain.PartnerOrderRefEntity;
import com.ecommerce.partner.domain.PartnerStatus;
import com.ecommerce.partner.domain.WebhookDeliveryEntity;
import com.ecommerce.partner.repo.PartnerOrderRefRepository;
import com.ecommerce.partner.repo.PartnerRepository;
import com.ecommerce.partner.repo.WebhookDeliveryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Consume {@code order.*} (queue partner.orders — additive-aware §3.4) →
 * lọc đơn thuộc partner → insert delivery PENDING (scheduler push).
 *
 * <p>Pattern OrderConfirmedEligibilityConsumer (SF-8): envelope parse raw +
 * ObjectMapper; idempotency marker prefix {@code wh:} (per consumer-group —
 * memory: marker global theo messageId) CÙNG tx với insert delivery.</p>
 *
 * <p>Poison-safe: envelope hỏng/eventType lạ/eventId thiếu → WARN + ack
 * (KHÔNG requeue — event hỏng không tự lành, marker không tiêu).</p>
 */
@Component
public class PartnerEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(PartnerEventConsumer.class);

    /** order.* → trạng thái partner nhận (deterministic theo eventType). */
    static final Map<String, String> STATUS_BY_EVENT = Map.of(
        "order.created", "PENDING",
        "order.paid", "PAID",
        "order.confirmed", "CONFIRMED",
        "order.cancelled", "CANCELLED",
        "order.failed", "FAILED");

    static final String MARKER_PREFIX = "wh:";

    private final IdempotentConsumer idempotentConsumer;
    private final PartnerOrderRefRepository refs;
    private final PartnerRepository partners;
    private final WebhookDeliveryRepository deliveries;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public PartnerEventConsumer(IdempotentConsumer idempotentConsumer,
                                PartnerOrderRefRepository refs,
                                PartnerRepository partners,
                                WebhookDeliveryRepository deliveries,
                                com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.idempotentConsumer = idempotentConsumer;
        this.refs = refs;
        this.partners = partners;
        this.deliveries = deliveries;
        this.objectMapper = objectMapper;
    }

    @Transactional
    @RabbitListener(queues = RabbitMqConfig.QUEUE_ORDERS,
        containerFactory = "partnerRabbitListenerContainerFactory")
    public void onOrderEvent(Message message) {
        EventEnvelope envelope;
        try {
            envelope = objectMapper.readValue(
                new String(message.getBody(), StandardCharsets.UTF_8), EventEnvelope.class);
        } catch (Exception e) {
            log.warn("[partner-webhook] envelope parse fail — ack bỏ qua (poison): {}", e.getMessage());
            return;
        }
        if (envelope == null || envelope.eventId() == null) {
            log.warn("[partner-webhook] envelope null/thiếu eventId — ack bỏ qua (poison)");
            return;
        }
        if (!STATUS_BY_EVENT.containsKey(envelope.eventType())) {
            // additive-aware: order.* lạ (ordering bổ sung sau GAP-4) → WARN + skip
            log.warn("[partner-webhook] eventType '{}' chưa có mapping — ack bỏ qua (không marker)",
                envelope.eventType());
            return;
        }
        if (!idempotentConsumer.tryConsume(MARKER_PREFIX + envelope.eventId())) {
            return; // đã xử lý event này
        }

        String orderId = envelope.payload() == null
            ? "" : envelope.payload().path("orderId").asText("");
        java.util.UUID orderUuid = null;
        if (!orderId.isBlank()) {
            try {
                orderUuid = java.util.UUID.fromString(orderId);
            } catch (IllegalArgumentException e) {
                // poison payload.orderId — không requeue (loop vô hạn)
                log.warn("[partner-webhook] {} orderId không parse được: '{}' — ack bỏ qua",
                    envelope.eventType(), orderId);
                return;
            }
        }
        if (orderUuid == null) {
            log.warn("[partner-webhook] {} thiếu payload.orderId — ack bỏ qua", envelope.eventType());
            return;
        }
        PartnerOrderRefEntity ref = refs.findByOrderId(orderUuid).orElse(null);
        if (ref == null) {
            log.debug("[partner-webhook] đơn {} không thuộc partner nào — bỏ qua", orderId);
            return; // đơn thường (không qua partner-api) — không webhook
        }
        PartnerEntity partner = partners.findById(ref.getPartnerId()).orElse(null);
        if (partner == null || partner.getStatus() != PartnerStatus.ACTIVE) {
            log.info("[partner-webhook] partner của đơn {} không ACTIVE — bỏ qua", orderId);
            return;
        }
        if (partner.getWebhookUrl() == null || partner.getWebhookUrl().isBlank()) {
            log.debug("[partner-webhook] partner {} không đăng ký webhook — bỏ qua", partner.getName());
            return;
        }

        // Body theo contract PartnerOrderChangedEvent — eventId = eventId envelope
        // (partner dedupe); raw body giữ nguyên cho mọi retry attempt.
        String body = objectMapper.valueToTree(Map.of(
            "eventId", envelope.eventId().toString(),
            "orderId", orderId,
            "partnerRef", ref.getPartnerRef(),
            "status", STATUS_BY_EVENT.get(envelope.eventType()),
            "occurredAt", envelope.occurredAt() == null
                ? java.time.Instant.now().toString() : envelope.occurredAt().toString())).toString();

        WebhookDeliveryEntity delivery = new WebhookDeliveryEntity();
        delivery.setPartnerId(partner.getId());
        delivery.setEventId(envelope.eventId());
        delivery.setOrderId(ref.getOrderId());
        delivery.setOrderStatus(STATUS_BY_EVENT.get(envelope.eventType()));
        delivery.setPayload(body);
        delivery.setDeliveryStatus(DeliveryStatus.PENDING);
        delivery.setNextRetryAt(java.time.Instant.now());
        deliveries.save(delivery);
        log.info("[partner-webhook] đơn {} ({}) → delivery PENDING cho {}",
            orderId, delivery.getOrderStatus(), partner.getWebhookUrl());
        // Scheduler quét PENDING đến hạn → POST (immediate trong vòng scheduler;
        // tách I/O khỏi tx listener — at-least-once, partner dedupe theo eventId)
    }
}
