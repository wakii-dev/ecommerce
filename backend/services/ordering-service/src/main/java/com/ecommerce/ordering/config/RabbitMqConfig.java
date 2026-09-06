package com.ecommerce.ordering.config;

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
 * Queue topology của ordering — 2 queue theo NHÓM producer (debug dễ + tách
 * backpressure payment vs inventory):
 * <ul>
 *   <li>{@code ordering.payments} ← payment.succeeded, payment.failed</li>
 *   <li>{@code ordering.inventory} ← inventory.committed, inventory.released</li>
 * </ul>
 *
 * <p>Idempotency: processed_messages chung của service — eventId là UUID v4
 * duy nhất per event instance nên 2 queue không đụng marker nhau (bài học
 * IdempotentConsumer per-group chỉ áp khi CÙNG event vào NHIỀU queue).</p>
 *
 * <p>Poison policy (như inventory): {@link ConditionalRejectingErrorHandler} —
 * conversion fail (envelope hỏng) reject KHÔNG requeue; lỗi transient → requeue.</p>
 */
@Configuration
public class RabbitMqConfig {

    public static final String QUEUE_PAYMENTS = "ordering.payments";
    public static final String QUEUE_INVENTORY = "ordering.inventory";

    @Bean
    Queue orderingPayments() {
        return QueueBuilder.durable(QUEUE_PAYMENTS).build();
    }

    @Bean
    Queue orderingInventory() {
        return QueueBuilder.durable(QUEUE_INVENTORY).build();
    }

    @Bean
    Binding paymentSucceededBinding(Queue orderingPayments, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(orderingPayments).to(outboxEventsExchange).with("payment.succeeded");
    }

    @Bean
    Binding paymentFailedBinding(Queue orderingPayments, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(orderingPayments).to(outboxEventsExchange).with("payment.failed");
    }

    @Bean
    Binding inventoryCommittedBinding(Queue orderingInventory, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(orderingInventory).to(outboxEventsExchange).with("inventory.committed");
    }

    @Bean
    Binding inventoryReleasedBinding(Queue orderingInventory, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(orderingInventory).to(outboxEventsExchange).with("inventory.released");
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
