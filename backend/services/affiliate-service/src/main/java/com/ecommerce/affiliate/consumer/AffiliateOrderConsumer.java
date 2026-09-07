package com.ecommerce.affiliate.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.affiliate.service.LedgerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import static com.ecommerce.affiliate.config.RabbitMqConfig.QUEUE_ORDERS;

/**
 * Consumer queue {@code affiliate.orders} ← order.confirmed / cancelled /
 * failed. Idempotent qua {@link IdempotentConsumer} (eventId) — MỘT queue cho
 * cả 3 event nên marker chung không xung đột; ledger còn có order_id UNIQUE
 * lớp 2. MỘT tx cho marker + business (TransactionTemplate — marker cùng tx
 * business, rollback = không ghost-marker, javadoc IdempotentConsumer).
 */
@Component
public class AffiliateOrderConsumer {

    private static final Logger log = LoggerFactory.getLogger(AffiliateOrderConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final LedgerService ledgerService;
    private final TransactionTemplate tx;

    public AffiliateOrderConsumer(IdempotentConsumer idempotentConsumer,
                                  LedgerService ledgerService,
                                  TransactionTemplate tx) {
        this.idempotentConsumer = idempotentConsumer;
        this.ledgerService = ledgerService;
        this.tx = tx;
    }

    @RabbitListener(queues = QUEUE_ORDERS)
    public void on(EventEnvelope envelope) {
        log.info("Nhận {} (eventId={})", envelope.eventType(), envelope.eventId());
        tx.executeWithoutResult(status -> {
            if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
                return; // re-delivery — đã xử lý
            }
            switch (envelope.eventType()) {
                case "order.confirmed" -> ledgerService.onOrderConfirmed(
                    envelope.payload().path("orderId").asText(null),
                    envelope.payload().path("total").asLong(0),
                    envelope.payload().path("affiliateCode").asText(null));
                case "order.cancelled", "order.failed" -> ledgerService.onOrderTerminal(
                    envelope.payload().path("orderId").asText(null));
                default -> log.warn("Queue affiliate.orders nhận eventType lạ {} — bỏ qua",
                    envelope.eventType());
            }
        });
    }
}
