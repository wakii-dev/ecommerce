package com.ecommerce.notification;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Instant;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * IT harness notification-service (SF-10) — pattern template/affiliate:
 * PostgreSQLContainer + RabbitMQContainer + Mailpit (SMTP sink + REST API
 * :8025 assert email) — TẤT CẢ singleton static (KHÔNG @Container per-class —
 * context cache dùng chung resource, memory Testcontainers-singleton).
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    @SuppressWarnings("resource")
    static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>("postgres:16").withDatabaseName("db_notification_test");

    @SuppressWarnings("resource")
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    /** Mailpit — SMTP :1025 (mapped) + HTTP API :8025 (mapped) assert email. */
    @SuppressWarnings("resource")
    static final GenericContainer<?> MAILPIT =
        new GenericContainer<>(DockerImageName.parse("axllent/mailpit"))
            .withExposedPorts(1025, 8025)
            .waitingFor(Wait.forHttp("/readyz").forPort(8025));

    static {
        POSTGRES.start();
        RABBIT.start();
        MAILPIT.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        registry.add("spring.mail.host", MAILPIT::getHost);
        registry.add("spring.mail.port", () -> MAILPIT.getMappedPort(1025));
        // identity/ordering base-url → WireMock-lite: dùng localhost port đóng
        // (InvoiceClient bắt mọi Exception → email vẫn gửi, attach empty) —
        // test hạnh phúc cài Http server mini (com.sun.net.httpserver).
        registry.add("notify.identity.base-url", () -> "http://localhost:1");
        registry.add("notify.ordering.base-url", () -> "http://localhost:1");
        registry.add("JWT_PUBLIC_KEY_PATH", () -> writeItKeys());
        registry.add("management.health.mail.enabled", () -> "false");
        registry.add("management.health.rabbit.enabled", () -> "false");
        registry.add("management.health.redis.enabled", () -> "false");
    }

    /** PEM rỗng — notification không decode JWT (chỉ nhận envelope MQ). */
    private static String writeItKeys() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KeyPair pair = generator.generateKeyPair();
            Path keyDir = Path.of("target", "it-keys");
            Files.createDirectories(keyDir);
            String base64 = java.util.Base64.getMimeEncoder(64, "\n".getBytes())
                .encodeToString(pair.getPublic().getEncoded());
            Path pem = keyDir.resolve("jwt-public.pem");
            Files.writeString(pem, "-----BEGIN PUBLIC KEY-----\n" + base64 + "\n-----END PUBLIC KEY-----\n");
            return "target/it-keys/jwt-public.pem";
        } catch (GeneralSecurityException | IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Publish raw message như OutboxRelay (xem AffiliateLedgerConsumerTest). */
    protected static void sendRaw(org.springframework.amqp.rabbit.core.RabbitTemplate rabbit,
                                  com.fasterxml.jackson.databind.ObjectMapper om,
                                  String routingKey, java.util.UUID eventId,
                                  java.util.Map<String, Object> payload) throws Exception {
        var envelope = new com.ecommerce.common.event.EventEnvelope(
            eventId, routingKey, Instant.now(), "it-" + eventId, "it-synthetic", 1,
            om.valueToTree(payload));
        var properties = new org.springframework.amqp.core.MessageProperties();
        properties.setContentType(org.springframework.amqp.core.MessageProperties.CONTENT_TYPE_JSON);
        properties.setDeliveryMode(org.springframework.amqp.core.MessageDeliveryMode.PERSISTENT);
        properties.setMessageId(String.valueOf(eventId));
        properties.setHeader("eventType", routingKey);
        rabbit.send("ecommerce.events", routingKey,
            new org.springframework.amqp.core.Message(
                om.writeValueAsString(envelope).getBytes(java.nio.charset.StandardCharsets.UTF_8),
                properties));
    }
}
