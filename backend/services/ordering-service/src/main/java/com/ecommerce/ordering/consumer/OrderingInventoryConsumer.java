package com.ecommerce.ordering.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.ordering.service.OrderLifecycleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import static com.ecommerce.ordering.config.RabbitMqConfig.QUEUE_INVENTORY;

/**
 * Consumer queue {@code ordering.inventory} ← inventory.committed /
 * inventory.released. MỘT tx cho marker + business (pattern như consumer
 * payments — javadoc IdempotentConsumer).
 *
 * <p>Mapping (pack §3): committed → CONFIRMED + order.confirmed fat;
 * released khi còn PENDING → CANCELLED (reservation TTL hết trước khi trả
 * tiền) + release coupon. released cho đơn terminal → no-op (path tự mình).</p>
 */
@Component
public class OrderingInventoryConsumer {

    private static final Logger log = LoggerFactory.getLogger(OrderingInventoryConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final OrderLifecycleService lifecycle;
    private final TransactionTemplate tx;

    public OrderingInventoryConsumer(
        IdempotentConsumer idempotentConsumer,
        OrderLifecycleService lifecycle,
        TransactionTemplate tx
    ) {
        this.idempotentConsumer = idempotentConsumer;
        this.lifecycle = lifecycle;
        this.tx = tx;
    }

    @RabbitListener(queues = QUEUE_INVENTORY)
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
                case "inventory.committed" -> lifecycle.onInventoryCommitted(orderId, envelope.correlationId());
                case "inventory.released" -> lifecycle.onInventoryReleased(orderId, envelope.correlationId());
                default -> log.warn("Queue inventory nhận eventType lạ {} — bỏ qua", envelope.eventType());
            }
        });
    }
}
