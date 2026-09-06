package com.ecommerce.identity.auth;

import com.ecommerce.common.outbox.OutboxRelay;
import com.ecommerce.identity.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * user.created QUA register HTTP thật: row outbox ghi cùng tx (payload =
 * EventEnvelope bọc business payload) → outboxRelay.poll() publish lên
 * exchange topic → nhận trên queue bind "user.created" với envelope nguyên vẹn.
 *
 * <p>@Testcontainers PHẢI có trên class NÀY (base đã bỏ — singleton POSTGRES
 * start thủ công): extension mới start RABBIT @Container trước khi context
 * đọc spring.rabbitmq.port.</p>
 */
@Testcontainers(disabledWithoutDocker = true)
class OutboxIntegrationTest extends AbstractIntegrationTest {

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management");

    @Autowired
    OutboxRelay outboxRelay;

    @Autowired
    RabbitTemplate rabbitTemplate;

    @Autowired
    RabbitAdmin rabbitAdmin;

    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void rabbitProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
    }

    @Test
    void registerWritesOutbox_andRelayPublishesUserCreated() throws Exception {
        // Bind queue TRƯỚC register — relay @Scheduled có thể publish trước
        // poll() thủ công; queue có sẵn binding thì message không rơi xuống đất.
        String queue = "it.identity.user.created";
        rabbitAdmin.declareQueue(new Queue(queue, false));
        rabbitAdmin.declareBinding(BindingBuilder.bind(new Queue(queue, false))
            .to(new TopicExchange("ecommerce.events")).with("user.created"));

        String correlationId = "req-it-" + System.nanoTime();
        String email = "outbox-" + System.nanoTime() + "@test.local";
        Map<?, ?> created = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build()
            .post().uri("/auth/register").header("Content-Type", "application/json")
            .header("X-Request-Id", correlationId)
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"Outbox User\"}".formatted(email))
            .exchange().expectStatus().isCreated()
            .expectBody(Map.class).returnResult().getResponseBody();
        String createdId = String.valueOf(created.get("id"));

        // Row outbox cùng tx — payload = JSON của EventEnvelope (jsonb normalize
        // format → parse JSON, đừng string-match).
        String payload = jdbc.queryForObject(
            "SELECT payload FROM outbox WHERE event_type = 'user.created' "
                + "ORDER BY created_at DESC LIMIT 1", String.class);
        com.fasterxml.jackson.databind.JsonNode envelope =
            new com.fasterxml.jackson.databind.ObjectMapper().readTree(payload);
        assertThat(envelope.path("eventType").asText()).isEqualTo("user.created");
        assertThat(envelope.path("correlationId").asText()).isEqualTo(correlationId);
        assertThat(envelope.path("payload").path("userId").asText())
            .as("payload.userId phải khớp id trong 201 response").isEqualTo(createdId);
        assertThat(envelope.path("payload").path("email").asText()).isEqualTo(email);

        outboxRelay.poll();

        // DB singleton chia sẻ giữa các class → queue có thể chứa cả event
        // user.created PENDING cũ của class trước (publish theo id ASC) — nhận
        // đến KHI khớp correlationId của register NÀY (drain tối đa 30 message).
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        org.springframework.amqp.core.Message received = null;
        for (int i = 0; i < 30 && received == null; i++) {
            org.springframework.amqp.core.Message message = rabbitTemplate.receive(queue, 500);
            if (message != null && correlationId.equals(
                mapper.readTree(message.getBody()).path("correlationId").asText())) {
                received = message;
            }
        }
        assertThat(received).as("relay phải publish user.created qua topic exchange").isNotNull();
        com.fasterxml.jackson.databind.JsonNode amqpEnvelope = mapper.readTree(received.getBody());
        assertThat(amqpEnvelope.path("eventType").asText()).isEqualTo("user.created");
        assertThat(amqpEnvelope.path("eventId").asText()).isNotBlank();
        assertThat(amqpEnvelope.path("payload").path("userId").asText()).isEqualTo(createdId);
        org.junit.jupiter.api.Assertions.assertEquals(
            "user.created", received.getMessageProperties().getHeader("eventType"));
    }
}
