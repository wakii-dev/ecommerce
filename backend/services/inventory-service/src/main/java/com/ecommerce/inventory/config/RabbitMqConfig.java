package com.ecommerce.inventory.config;

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
 * Queue topology của inventory — common-lib chỉ declare exchange
 * `ecommerce.events` (CommonLibAutoConfiguration); service tự declare:
 * queue durable `inventory.orders` + 3 bindings order.paid/cancelled/failed.
 *
 * <p>Poison policy (plan-critic cycle 2): {@link ConditionalRejectingErrorHandler}
 * — conversion fail (envelope hỏng) là FATAL → reject KHÔNG requeue (không
 * storm); lỗi TRANSIENT (DB blip...) → requeue, giữ at-least-once.</p>
 */
@Configuration
public class RabbitMqConfig {

    public static final String QUEUE_ORDERS = "inventory.orders";

    @Bean
    Queue inventoryOrders() {
        return QueueBuilder.durable(QUEUE_ORDERS).build();
    }

    @Bean
    Binding orderPaidBinding(Queue inventoryOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(inventoryOrders).to(outboxEventsExchange).with("order.paid");
    }

    @Bean
    Binding orderCancelledBinding(Queue inventoryOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(inventoryOrders).to(outboxEventsExchange).with("order.cancelled");
    }

    @Bean
    Binding orderFailedBinding(Queue inventoryOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(inventoryOrders).to(outboxEventsExchange).with("order.failed");
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
