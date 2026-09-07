package com.ecommerce.log;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.log.domain.EventLogDocument;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT fan-in consumer (SF-10, D14): publish order.confirmed + product.changed
 * (2 routing key KHÁC nhau) qua exchange thật → 2 document event_log với
 * routingKey đúng; re-delivery cùng eventId → vẫn 1 document (unique index).
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class EventLogConsumerTest {

    @Container
    static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7");

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", () -> MONGO.getReplicaSetUrl("db_log"));
        registry.add("spring.data.mongodb.database", () -> "db_log");
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        registry.add("management.health.rabbit.enabled", () -> "false");
    }

    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    ObjectMapper om;
    @Autowired
    MongoTemplate mongo;

    @Test
    void fanInHaiRoutingKeyVaDedup() throws Exception {
        UUID orderEvent = UUID.randomUUID();
        sendRaw("order.confirmed", orderEvent, Map.of(
            "orderId", UUID.randomUUID().toString(),
            "userId", UUID.randomUUID().toString(),
            "email", "it-log@demo.vn",
            "items", java.util.List.of(Map.of(
                "productId", UUID.randomUUID().toString(),
                "variantId", UUID.randomUUID().toString(),
                "qty", 1, "price", 100_000, "name", "x")),
            "subtotal", 100_000, "discount", 0, "shippingFee", 25_000,
            "total", 125_000, "currency", "VND",
            "confirmedAt", Instant.now().toString()));

        UUID productEvent = UUID.randomUUID();
        sendRaw("product.changed", productEvent, Map.of(
            "productId", UUID.randomUUID().toString(),
            "action", "UPDATED"));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            assertThat(mongo.count(
                new Query(Criteria.where("eventId").is(orderEvent)), EventLogDocument.class)).isEqualTo(1);
            assertThat(mongo.count(
                new Query(Criteria.where("eventId").is(productEvent)), EventLogDocument.class)).isEqualTo(1);
        });

        EventLogDocument orderDoc = mongo.findOne(
            new Query(Criteria.where("eventId").is(orderEvent)), EventLogDocument.class);
        assertThat(orderDoc.getRoutingKey()).isEqualTo("order.confirmed");
        assertThat(orderDoc.getCorrelationId()).isEqualTo("it-" + orderEvent);
        assertThat(orderDoc.getReceivedAt()).isNotNull();

        // re-delivery cùng eventId → unique index chặn, không doub document
        sendRaw("order.confirmed", orderEvent, Map.of("orderId", "dup"));
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        assertThat(mongo.count(
            new Query(Criteria.where("eventId").is(orderEvent)), EventLogDocument.class)).isEqualTo(1);
    }

    private void sendRaw(String routingKey, UUID eventId, Map<String, Object> payload) throws Exception {
        Map<String, Object> full = new HashMap<>(payload);
        var envelope = new EventEnvelope(eventId, routingKey, Instant.now(),
            "it-" + eventId, "it-synthetic", 1, om.valueToTree(full));
        var properties = new MessageProperties();
        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        properties.setMessageId(String.valueOf(eventId));
        properties.setHeader("eventType", routingKey);
        rabbit.send("ecommerce.events", routingKey,
            new Message(om.writeValueAsString(envelope).getBytes(StandardCharsets.UTF_8), properties));
    }
}
