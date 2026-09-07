package com.ecommerce.log.config;

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
 * Queue topology của log-service (SF-10, D14): MỘT queue fan-in.
 *
 * <ul>
 *   <li>{@code log.events} ← {@code #} (MỌI routing key trên exchange —
 *       mọi domain event của demo: order.*, payment.*, inventory.*,
 *       product.changed, user.created, review.moderated).</li>
 * </ul>
 *
 * <p>Exchange TỰ DECLARE (durable, non-auto-delete — trùng thuộc tính với
 * common-lib): CommonLibAutoConfiguration backs off khi không có JpaRepository
 * trên classpath (log không PG — exclude starter-data-jpa). Declaration trùng
 * tên là idempotent trên broker (RabbitAdmin).</p>
 *
 * <p>Poison: {@link ConditionalRejectingErrorHandler} — envelope hỏng reject
 * không requeue (1 event hỏng KHÔNG được chặn audit trail).</p>
 */
@Configuration
public class RabbitMqConfig {

    public static final String QUEUE_EVENTS = "log.events";

    @Bean
    TopicExchange logEventsExchange(@Value("${outbox.relay.exchange:ecommerce.events}") String exchange) {
        return new TopicExchange(exchange, true, false);
    }

    @Bean
    Queue logEvents() {
        return QueueBuilder.durable(QUEUE_EVENTS).build();
    }

    @Bean
    Binding fanInAllBinding(Queue logEvents, TopicExchange logEventsExchange) {
        return BindingBuilder.bind(logEvents).to(logEventsExchange).with("#");
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
