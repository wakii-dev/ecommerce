package com.ecommerce.notification.config;

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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Queue topology của notification (SF-10) — 2 queue nhóm theo domain
 * (debug dễ; idempotency theo eventId: 1 queue nhận nhiều eventType thì marker
 * chung không đụng nhau — bài học IdempotentConsumer per-group chỉ áp khi
 * CÙNG event vào NHIỀU queue của CÙNG service):
 *
 * <ul>
 *   <li>{@code notification.orders} ← order.confirmed (email cảm ơn + attach
 *       PDF hóa đơn), order.cancelled (payload không có email → send-log
 *       SKIPPED — fat-payload rule §6.1.5 cấm call-back).</li>
 *   <li>{@code notification.reviews} ← review.moderated (email kết quả duyệt
 *       NẾU payload có email — schema hiện không có → SKIPPED).</li>
 * </ul>
 *
 * <p>Poison policy (như affiliate/ordering): {@link ConditionalRejectingErrorHandler}
 * — conversion fail reject không requeue; lỗi transient → requeue.</p>
 */
@Configuration
public class RabbitMqConfig {

    public static final String QUEUE_ORDERS = "notification.orders";
    public static final String QUEUE_REVIEWS = "notification.reviews";
    public static final String QUEUE_PASSWORD_RESET = "notification.password_reset";

    @Bean
    Queue notificationOrders() {
        return QueueBuilder.durable(QUEUE_ORDERS).build();
    }

    @Bean
    Queue notificationReviews() {
        return QueueBuilder.durable(QUEUE_REVIEWS).build();
    }

    @Bean
    Queue notificationPasswordReset() {
        return QueueBuilder.durable(QUEUE_PASSWORD_RESET).build();
    }

    @Bean
    Binding passwordResetRequestedBinding(Queue notificationPasswordReset, TopicExchange outboxEventsExchange) {
        // SF-13 (FI-323) A1 — event mới ngoài freeze 13 (ADR 0005): identity outbox
        // user.password_reset_requested {email, token, expiresAt} → mail link reset.
        return BindingBuilder.bind(notificationPasswordReset).to(outboxEventsExchange)
            .with("user.password_reset_requested");
    }

    @Bean
    Binding orderConfirmedBinding(Queue notificationOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(notificationOrders).to(outboxEventsExchange).with("order.confirmed");
    }

    @Bean
    Binding orderCancelledBinding(Queue notificationOrders, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(notificationOrders).to(outboxEventsExchange).with("order.cancelled");
    }

    @Bean
    Binding reviewModeratedBinding(Queue notificationReviews, TopicExchange outboxEventsExchange) {
        return BindingBuilder.bind(notificationReviews).to(outboxEventsExchange).with("review.moderated");
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
