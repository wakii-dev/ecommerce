package com.ecommerce.template;

import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.common.outbox.OutboxMessage;
import com.ecommerce.common.outbox.OutboxRelay;
import com.ecommerce.common.outbox.OutboxStatus;
import com.ecommerce.common.outbox.OutboxWriter;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * IT cho ĐÚNG path đã phát hiện bug round-1: OutboxWriter wrap envelope →
 * jsonb round-trip → OutboxRelay publish thật (RabbitMQ Testcontainers) →
 * envelope nhận nguyên vẹn; + regression cho IdempotentConsumer (marker cùng
 * tx business — rollback không để ghost marker).
 */
@Testcontainers(disabledWithoutDocker = true)
class OutboxIntegrationTest extends AbstractIntegrationTest {

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management");

    @Autowired
    OutboxWriter outboxWriter;

    @Autowired
    OutboxRelay outboxRelay;

    @Autowired
    IdempotentConsumer idempotentConsumer;

    @Autowired
    RabbitTemplate rabbitTemplate;

    @Autowired
    RabbitAdmin rabbitAdmin;

    @Autowired
    PlatformTransactionManager txManager;

    @Autowired
    JdbcTemplate jdbc;

    @org.springframework.test.context.DynamicPropertySource
    static void rabbitProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
    }

    @Test
    void writeThenRelayPublishesEnvelopeRoundTrip() throws Exception {
        String queue = "it.outbox.roundtrip";
        rabbitAdmin.declareQueue(new Queue(queue, false));
        rabbitAdmin.declareBinding(BindingBuilder.bind(new Queue(queue, false))
            .to(new TopicExchange("ecommerce.events")).with("it.event"));

        TransactionTemplate tx = new TransactionTemplate(txManager);
        tx.executeWithoutResult(status -> outboxWriter.write(
            "it.event",
            new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(Map.of("order_id", "o-1", "total", 123000)),
            "req-it-42"));

        outboxRelay.poll();

        org.springframework.amqp.core.Message received =
            rabbitTemplate.receive(queue, 5000);
        assertThat(received).as("relay phải publish message qua topic exchange").isNotNull();
        // jsonb normalize format (space sau ':', thứ tự key) — parse JSON, đừng string-match
        com.fasterxml.jackson.databind.JsonNode envelope =
            new com.fasterxml.jackson.databind.ObjectMapper().readTree(received.getBody());
        assertThat(envelope.path("eventType").asText()).isEqualTo("it.event");
        assertThat(envelope.path("correlationId").asText()).isEqualTo("req-it-42");
        assertThat(envelope.path("payload").path("order_id").asText()).isEqualTo("o-1");
        assertThat(envelope.path("eventId").asText()).isNotBlank();
        assertThat(received.getMessageProperties().getMessageId()).isNotBlank();

        Integer sentRows = jdbc.queryForObject(
            "SELECT count(*) FROM outbox WHERE status = 'SENT' AND correlation_id = 'req-it-42'",
            Integer.class);
        assertThat(sentRows).isEqualTo(1);
    }

    @Test
    void idempotentMarkerRollsBackWithBusinessTransaction() {
        IdempotentConsumer consumer = idempotentConsumer;
        TransactionTemplate tx = new TransactionTemplate(txManager);

        // lần 1: consumer đầu tiên → true
        Boolean first = tx.execute(s -> consumer.tryConsume("evt-ghost-1"));
        assertThat(first).isTrue();

        // business rollback: marker + business PHẢI rollback cùng nhau (không ghost)
        assertThatThrownBy(() -> tx.execute(s -> {
            consumer.tryConsume("evt-ghost-2");
            throw new IllegalStateException("business failure");
        })).hasMessageContaining("business failure");

        Boolean afterRollback = tx.execute(s -> consumer.tryConsume("evt-ghost-2"));
        assertThat(afterRollback)
            .as("marker của tx đã rollback phải biến mất — event gửi lại không bị skip")
            .isTrue();

        // retry lần 2 cùng eventId → đã xử lý → false
        Boolean duplicate = tx.execute(s -> consumer.tryConsume("evt-ghost-1"));
        assertThat(duplicate).isFalse();
    }
}
