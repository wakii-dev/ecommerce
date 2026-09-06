package com.ecommerce.partner.config;

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
 * Topology webhook partner (SF-11): MỘT queue {@code partner.orders} bind
 * wildcard {@code order.*} trên exchange outbox {@code ecommerce.events}
 * (TopicExchange do CommonLibAutoConfiguration declare).
 *
 * <p>Additive-aware (spec §3.4): ordering BỔ SUNG event mới (vd order.shipped
 * sau GAP-4 amendment) → tự chảy vào queue; consumer xử lý 5 keys đã biết,
 * key lạ → WARN + skip (không crash, không marker) — thêm mapping là edit
 * additive, không đổi topology.</p>
 *
 * <p>Poison policy như ordering: {@link ConditionalRejectingErrorHandler} —
 * conversion fail reject KHÔNG requeue; consumer tự xử lý poison envelope
 * (WARN + ack) nên listener hầu như không thấy exception.</p>
 */
@Configuration
public class RabbitMqConfig {

    public static final String QUEUE_ORDERS = "partner.orders";

    @Bean
    Queue partnerOrders() {
        return QueueBuilder.durable(QUEUE_ORDERS).build();
    }

    @Bean
    Binding partnerOrdersBinding(Queue partnerOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(partnerOrders).to(outboxEventsExchange).with("order.*");
    }

    @Bean
    Jackson2JsonMessageConverter partnerJackson2JsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    SimpleRabbitListenerContainerFactory partnerRabbitListenerContainerFactory(
        ConnectionFactory connectionFactory, Jackson2JsonMessageConverter partnerJackson2JsonMessageConverter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(partnerJackson2JsonMessageConverter);
        factory.setErrorHandler(new ConditionalRejectingErrorHandler());
        return factory;
    }
}
