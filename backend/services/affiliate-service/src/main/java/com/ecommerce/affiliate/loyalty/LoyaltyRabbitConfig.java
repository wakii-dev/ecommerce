package com.ecommerce.affiliate.loyalty;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Topology queue LOYALTY (SF-14, D22) — config class RIÊNG trong file-slice
 * {@code loyalty/} (không sửa RabbitMqConfig của SF-12; chỉ KHAI BÁO thêm
 * queue + binding, listener container factory dùng chung bean sẵn có).
 *
 * <p>Queue {@code affiliate.loyalty} ← order.confirmed / cancelled / failed —
 * CÙNG event với queue {@code affiliate.orders} của SF-12 → marker eventId
 * CHUNG sẽ xung đột (memory IdempotentConsumer per-group) → consumer loyalty
 * dùng marker prefix {@code loyalty:<eventId>}.</p>
 */
@Configuration
public class LoyaltyRabbitConfig {

    public static final String QUEUE_LOYALTY = "affiliate.loyalty";

    @Bean
    Queue loyaltyOrders() {
        return QueueBuilder.durable(QUEUE_LOYALTY).build();
    }

    @Bean
    Binding loyaltyOrderConfirmedBinding(Queue loyaltyOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(loyaltyOrders).to(outboxEventsExchange).with("order.confirmed");
    }

    @Bean
    Binding loyaltyOrderCancelledBinding(Queue loyaltyOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(loyaltyOrders).to(outboxEventsExchange).with("order.cancelled");
    }

    @Bean
    Binding loyaltyOrderFailedBinding(Queue loyaltyOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(loyaltyOrders).to(outboxEventsExchange).with("order.failed");
    }
}
