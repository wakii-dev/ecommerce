package com.ecommerce.payment.service;

import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.payment.domain.PaymentIntent;
import com.ecommerce.payment.domain.PaymentIntentStatus;
import com.ecommerce.payment.repo.PaymentIntentRepository;
import com.ecommerce.payment.spi.PaymentProviderAdapter;
import com.ecommerce.payment.spi.ProviderWebhookEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Webhook Stripe (spec §5.4): verify HMAC TRƯỚC (adapter) → dedupe theo
 * `stripe:<evt_id>` qua processed_messages → update status + outbox
 * `payment.succeeded|failed` — TẤT CẢ trong MỘT tx (marker + business + outbox
 * cùng tx — javadoc IdempotentConsumer: tách tx = ghost-marker).
 * `charge.refunded` → status REFUNDED (silent, không publish). Không thấy intent
 * local → warn + 200 (Stripe retry không giúp gì — tránh 500 storm).
 */
@Service
public class PaymentWebhookService {

    private static final Logger log = LoggerFactory.getLogger(PaymentWebhookService.class);

    private final PaymentProviderAdapter adapter;
    private final PaymentIntentRepository intents;
    private final OutboxWriter outbox;
    private final IdempotentConsumer idempotentConsumer;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public PaymentWebhookService(
        PaymentProviderAdapter adapter,
        PaymentIntentRepository intents,
        OutboxWriter outbox,
        IdempotentConsumer idempotentConsumer,
        ObjectMapper objectMapper,
        TransactionTemplate tx
    ) {
        this.adapter = adapter;
        this.intents = intents;
        this.outbox = outbox;
        this.idempotentConsumer = idempotentConsumer;
        this.objectMapper = objectMapper;
        this.tx = tx;
    }

    /** @return true nếu event được xử lý lần đầu; false nếu duplicate/no-op (vẫn ack 200). */
    public boolean handle(String rawBody, String signatureHeader) {
        // Verify HMAC ngoài tx — sai sig không đụng DB (400 trước, pack ACCEPTANCE)
        ProviderWebhookEvent event = adapter.verifyWebhook(rawBody, signatureHeader);

        Boolean processed = tx.execute(status -> {
            if (!idempotentConsumer.tryConsume("stripe:" + event.eventId())) {
                log.info("Webhook {} trùng (re-delivery Stripe) — ack no-op", event.eventId());
                return false;
            }
            apply(event);
            return true;
        });
        return Boolean.TRUE.equals(processed);
    }

    private void apply(ProviderWebhookEvent event) {
        switch (event.type() != null ? event.type() : "") {
            case "payment_intent.succeeded" -> updateStatus(event, PaymentIntentStatus.SUCCEEDED,
                "payment.succeeded", null);
            case "payment_intent.payment_failed" -> updateStatus(event, PaymentIntentStatus.FAILED,
                "payment.failed", event.failureMessage());
            case "charge.refunded" -> {
                intents.findByStripeIntentId(event.intentId()).ifPresentOrElse(intent -> {
                    if (intent.getStatus() == PaymentIntentStatus.REFUNDED
                        || intent.getStatus() == PaymentIntentStatus.VOIDED) {
                        log.warn("Bỏ qua charge.refunded cho intent {} — đã {} (re-delivery/out-of-order)",
                            event.intentId(), intent.getStatus());
                        return;
                    }
                    intent.markStatus(PaymentIntentStatus.REFUNDED);
                    intents.save(intent);
                    log.info("Intent {} REFUNDED (charge.refunded)", event.intentId());
                }, () -> log.warn("charge.refunded cho {} không có intent local — no-op", event.intentId()));
            }
            default -> log.info("Webhook type {} không liên quan lifecycle — ack no-op", event.type());
        }
    }

    private void updateStatus(ProviderWebhookEvent event, PaymentIntentStatus lifecycleStatus,
                              String outboxEventType, String failureReason) {
        PaymentIntent intent = intents.findByStripeIntentId(event.intentId()).orElse(null);
        if (intent == null) {
            log.warn("{} cho {} không có intent local — no-op (không 500, Stripe retry vô ích)",
                event.type(), event.intentId());
            return;
        }
        // Out-of-order guard (Stripe không đảm bảo thứ tự): attempt 1 fail (event A),
        // attempt 2 succeed (event B) — nếu A tới SAU B thì KHÔNG được hạ cấp
        // SUCCEEDED/REFUNDED/VOIDED → FAILED (false payment.failed). Chiều lên vẫn mở.
        if (lifecycleStatus == PaymentIntentStatus.FAILED && intent.getStatus() != null
            && (intent.getStatus() == PaymentIntentStatus.SUCCEEDED
                || intent.getStatus() == PaymentIntentStatus.REFUNDED
                || intent.getStatus() == PaymentIntentStatus.VOIDED)) {
            log.warn("Bỏ qua {} cho intent {} — đã terminal-positive {} (event out-of-order)",
                event.type(), intent.getStripeIntentId(), intent.getStatus());
            return;
        }
        // succeeded sau REFUNDED (security-audit L-1): tiền đã trả lại — không
        // resurrect REFUNDED → SUCCEEDED (state divergence local vs Stripe)
        if (lifecycleStatus == PaymentIntentStatus.SUCCEEDED
            && intent.getStatus() == PaymentIntentStatus.REFUNDED) {
            log.warn("Bỏ qua {} cho intent {} — đã REFUNDED (event out-of-order)",
                event.type(), intent.getStripeIntentId());
            return;
        }
        intent.markStatus(lifecycleStatus);
        intent.markStripeStatus(mirrorOf(event.type()));
        intents.save(intent);

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("orderId", intent.getOrderId());
        payload.put("paymentIntentId", intent.getStripeIntentId());
        payload.put("amount", event.amount() != null ? event.amount() : intent.getAmountVnd());
        payload.put("currency", intent.getCurrency()); // 'VND' uppercase thống nhất
        payload.put("failureReason", failureReason);
        outbox.write(outboxEventType, payload, event.eventId()); // correlationId = evt id (webhook-origin)
        log.info("{} → intent {} ({}) — outbox {}",
            event.type(), intent.getStripeIntentId(), lifecycleStatus, outboxEventType);
    }

    /** payment_intent.succeeded → SUCCEEDED | payment_intent.payment_failed → FAILED. */
    private String mirrorOf(String type) {
        return switch (type) {
            case "payment_intent.succeeded" -> "SUCCEEDED";
            case "payment_intent.payment_failed" -> "FAILED";
            default -> null;
        };
    }
}
