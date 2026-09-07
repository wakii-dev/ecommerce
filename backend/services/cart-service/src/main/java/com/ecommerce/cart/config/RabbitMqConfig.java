package com.ecommerce.cart.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.ConditionalRejectingErrorHandler;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Queue topology của cart (SF-10 — file-slice theo Javadoc
 * CartServiceApplication): 1 queue duy nhất.
 *
 * <ul>
 *   <li>{@code cart.orders} ← order.confirmed (§3.2 — xóa cart items của user
 *       sau khi mua: {@code cart:user:{userId}}).</li>
 * </ul>
 *
 * <p><strong>DEVIATION affiliate pattern:</strong> cart tự declare
 * {@link TopicExchange} thay vì inject bean {@code outboxEventsExchange} của
 * common-lib — outer guard {@code CommonLibAutoConfiguration} yêu cầu
 * JpaRepository TRÊN CLASSPATH (cart exclude starter-data-jpa, không DB) nên
 * auto-config backing-off → không có exchange bean. Declaration trùng tên/
 * thuộc tính (durable, non-auto-delete) là idempotent trên broker (RabbitAdmin).</p>
 *
 * <p>Poison policy (như affiliate/ordering): {@link ConditionalRejectingErrorHandler}
 * — conversion fail (envelope hỏng) reject KHÔNG requeue; lỗi transient → requeue.</p>
 */
@Configuration
public class RabbitMqConfig {

    public static final String QUEUE_ORDERS = "cart.orders";

    @Bean
    TopicExchange cartEventsExchange(@Value("${outbox.relay.exchange:ecommerce.events}") String exchange) {
        return new TopicExchange(exchange, true, false);
    }

    @Bean
    Queue cartOrders() {
        return QueueBuilder.durable(QUEUE_ORDERS).build();
    }

    @Bean
    Binding orderConfirmedBinding(Queue cartOrders, TopicExchange cartEventsExchange) {
        return BindingBuilder.bind(cartOrders).to(cartEventsExchange).with("order.confirmed");
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
