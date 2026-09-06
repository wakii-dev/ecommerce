package com.ecommerce.ordering.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.ordering.service.OrderLifecycleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import static com.ecommerce.ordering.config.RabbitMqConfig.QUEUE_PAYMENTS;

/**
 * Consumer queue {@code ordering.payments} ← payment.succeeded / payment.failed.
 * Idempotent qua {@link IdempotentConsumer} (eventId) — re-delivery
 * at-least-once không double-PAID / double-refund. MỘT tx cho marker + business
 * (TransactionTemplate consumer — javadoc IdempotentConsumer: marker cùng tx
 * business, rollback = không ghost-marker; lifecycle service JOIN tx này).
 */
@Component
public class OrderingPaymentConsumer {

    private static final Logger log = LoggerFactory.getLogger(OrderingPaymentConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final OrderLifecycleService lifecycle;
    private final TransactionTemplate tx;

    public OrderingPaymentConsumer(
        IdempotentConsumer idempotentConsumer,
        OrderLifecycleService lifecycle,
        TransactionTemplate tx
    ) {
        this.idempotentConsumer = idempotentConsumer;
        this.lifecycle = lifecycle;
        this.tx = tx;
    }

    @RabbitListener(queues = QUEUE_PAYMENTS)
    public void on(EventEnvelope envelope) {
        String orderId = envelope.payload().path("orderId").asText(null);
        if (orderId == null || orderId.isBlank()) {
            log.error("Event {} thiếu payload.orderId — drop (poison shape)", envelope.eventId());
            return;
        }
        log.info("Nhận {} cho order {} (eventId={})", envelope.eventType(), orderId, envelope.eventId());
        tx.executeWithoutResult(status -> {
            if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
                return; // re-delivery — đã xử lý
            }
            switch (envelope.eventType()) {
                case "payment.succeeded" -> lifecycle.onPaymentSucceeded(orderId,
                    envelope.payload().path("paymentIntentId").asText(null), envelope.correlationId());
                case "payment.failed" -> lifecycle.onPaymentFailed(orderId,
                    envelope.payload().path("failureReason").asText(null), envelope.correlationId());
                default -> log.warn("Queue payments nhận eventType lạ {} — bỏ qua", envelope.eventType());
            }
        });
    }
}
