package com.ecommerce.affiliate.loyalty;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static com.ecommerce.affiliate.loyalty.LoyaltyRabbitConfig.QUEUE_LOYALTY;

/**
 * Consumer loyalty (SF-14, D22) — queue {@code affiliate.loyalty}:
 *
 * <ul>
 *   <li><strong>order.confirmed</strong> → EARN (total đã trừ coupon + điểm).</li>
 *   <li><strong>order.cancelled / order.failed</strong> → reversal: hoàn điểm
 *       REDEEM + thu hồi EARN của đơn (quyết định spec D5).</li>
 * </ul>
 *
 * <p>Marker eventId PREFIX {@code loyalty:} — queue này nhận CÙNG event với
 * {@code affiliate.orders} (SF-12) nên marker chung sẽ ăn nhau (memory
 * IdempotentConsumer per-group: cùng event vào nhiều queue → prefix group).
 * MỘT tx cho marker + business (rollback = không ghost-marker).</p>
 */
@Component
public class LoyaltyOrderConsumer {

    private static final Logger log = LoggerFactory.getLogger(LoyaltyOrderConsumer.class);
    private static final String MARKER_PREFIX = "loyalty:";

    private final IdempotentConsumer idempotentConsumer;
    private final LoyaltyService loyaltyService;
    private final TransactionTemplate tx;

    public LoyaltyOrderConsumer(IdempotentConsumer idempotentConsumer,
                                LoyaltyService loyaltyService,
                                TransactionTemplate tx) {
        this.idempotentConsumer = idempotentConsumer;
        this.loyaltyService = loyaltyService;
        this.tx = tx;
    }

    @RabbitListener(queues = QUEUE_LOYALTY)
    public void on(EventEnvelope envelope) {
        log.info("[loyalty] Nhận {} (eventId={})", envelope.eventType(), envelope.eventId());
        tx.executeWithoutResult(status -> {
            if (!idempotentConsumer.tryConsume(MARKER_PREFIX + envelope.eventId())) {
                return; // re-delivery — đã xử lý
            }
            String orderId = envelope.payload().path("orderId").asText(null);
            switch (envelope.eventType()) {
                case "order.confirmed" -> loyaltyService.earn(
                    orderId,
                    uuidOrNull(envelope.payload().path("userId").asText(null)),
                    envelope.payload().path("total").asLong(0));
                case "order.cancelled", "order.failed" -> loyaltyService.reverseOrder(orderId);
                default -> log.warn("[loyalty] eventType lạ {} — bỏ qua", envelope.eventType());
            }
        });
    }

    private UUID uuidOrNull(String value) {
        try {
            return value == null ? null : UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
