package com.ecommerce.cart.consumer;

import com.ecommerce.cart.config.RabbitMqConfig;
import com.ecommerce.cart.store.CartStore;
import com.ecommerce.common.event.EventEnvelope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * Consumer {@code order.confirmed} (SF-10, §3.2): đơn CONFIRMED → xóa cart
 * items của user ({@code cart:user:{userId}} — userId là JWT {@code sub},
 * chính là key của cart user, xem {@link CartStore#userKey(String)}).
 *
 * <p><strong>Idempotency KHÔNG qua IdempotentConsumer:</strong> cart không có
 * DB (D8) nên không có bảng {@code processed_messages} — {@code DEL} trên
 * Redis tự idempotent (re-delivery xóa phím đã mất → no-op), đúng nghĩa
 * at-least-once. KHÔNG clear {@code cart:guest:*} — guest cart của session
 * khác không thuộc đơn này; TTL 30 ngày tự dọn.</p>
 *
 * <p>Poison → ConditionalRejectingErrorHandler (RabbitMqConfig): envelope
 * hỏng reject không requeue, không chặn queue.</p>
 */
@Component
public class CartOrderConsumer {

    private static final Logger log = LoggerFactory.getLogger(CartOrderConsumer.class);

    private final CartStore cartStore;

    public CartOrderConsumer(CartStore cartStore) {
        this.cartStore = cartStore;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_ORDERS)
    public void on(EventEnvelope envelope) {
        if (!"order.confirmed".equals(envelope.eventType())) {
            log.warn("Queue {} nhận eventType lạ {} — bỏ qua",
                RabbitMqConfig.QUEUE_ORDERS, envelope.eventType());
            return;
        }
        String userId = envelope.payload().path("userId").asText(null);
        if (userId == null || userId.isBlank()) {
            log.warn("order.confirmed thiếu payload.userId (eventId={}) — bỏ qua clear cart", envelope.eventId());
            return;
        }
        String key = CartStore.userKey(userId);
        cartStore.delete(key);
        log.info("Đơn {} CONFIRMED → đã xóa cart {} (eventId={})",
            envelope.payload().path("orderId").asText("?"), key, envelope.eventId());
    }
}
