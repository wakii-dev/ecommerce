package com.ecommerce.affiliate.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.ConditionalRejectingErrorHandler;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Queue topology của affiliate — 1 queue nhóm order.* (debug dễ + idempotency
 * theo eventId an toàn: 1 queue nhận cả confirmed/cancelled/failed thì marker
 * chung không đụng nhau — bài học IdempotentConsumer per-group chỉ áp khi
 * CÙNG event vào NHIỀU queue).
 *
 * <ul>
 *   <li>{@code affiliate.orders} ← order.confirmed (tạo ledger PENDING),
 *       order.cancelled / order.failed (gỡ ledger PENDING của order đó)</li>
 * </ul>
 *
 * <p>Poison policy (như ordering/inventory): {@link ConditionalRejectingErrorHandler} —
 * conversion fail (envelope hỏng) reject KHÔNG requeue; lỗi transient → requeue.</p>
 */
@Configuration
public class RabbitMqConfig {

    public static final String QUEUE_ORDERS = "affiliate.orders";

    @Bean
    Queue affiliateOrders() {
        return QueueBuilder.durable(QUEUE_ORDERS).build();
    }

    @Bean
    Binding orderConfirmedBinding(Queue affiliateOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(affiliateOrders).to(outboxEventsExchange).with("order.confirmed");
    }

    @Bean
    Binding orderCancelledBinding(Queue affiliateOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(affiliateOrders).to(outboxEventsExchange).with("order.cancelled");
    }

    @Bean
    Binding orderFailedBinding(Queue affiliateOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(affiliateOrders).to(outboxEventsExchange).with("order.failed");
    }

    @Bean
    Jackson2JsonMessageConverter jackson2JsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
        ConnectionFactory connectionFactory, Jackson2JsonMessageConverter converter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(converter);
        factory.setErrorHandler(new ConditionalRejectingErrorHandler());
        return factory;
    }
}
