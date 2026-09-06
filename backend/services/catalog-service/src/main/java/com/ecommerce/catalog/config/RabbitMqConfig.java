package com.ecommerce.catalog.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Topology AMQP của catalog-service (Conventions #6): topic exchange
 * {@code ecommerce.events} dùng chung platform (OutboxRelay publish) + queue
 * indexer consume {@code product.changed} (Task 5). Task 7 append queue cache
 * vào CÙNG exchange — KHÔNG đổi args của bean này (declare idempotent, args
 * lệch → PRECONDITION_FAILED channel error).
 */
@Configuration
public class RabbitMqConfig {

    public static final String EVENTS_EXCHANGE = "ecommerce.events";
    public static final String ROUTING_PRODUCT_CHANGED = "product.changed";
    public static final String INDEXER_QUEUE = "q.catalog.product-changed.indexer";

    @Bean
    public TopicExchange eventsExchange() {
        return new TopicExchange(EVENTS_EXCHANGE, true, false);
    }

    @Bean
    public Queue indexerQueue() {
        return QueueBuilder.durable(INDEXER_QUEUE).build();
    }

    @Bean
    public Binding indexerBinding() {
        return BindingBuilder.bind(indexerQueue()).to(eventsExchange()).with(ROUTING_PRODUCT_CHANGED);
    }
}
