package com.ecommerce.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * IT consumer newsletter (SF-13 A8): envelope user.newsletter_subscribed →
 * Mailpit nhận welcome mail; dup eventId → 1 mail (idempotent).
 */
@Tag("integration")
class NewsletterConsumerTest extends AbstractIntegrationTest {

    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;

    @Test
    void newsletterSubscribed_guiWelcomeMail() throws Exception {
        UUID eventId = UUID.randomUUID();
        sendRaw(rabbit, om, "user.newsletter_subscribed", eventId, Map.of(
            "email", "it-news@demo.vn",
            "subscribedAt", java.time.Instant.now().toString()));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid AND status = 'SENT'",
                Integer.class, eventId.toString());
            assertThat(sent).isEqualTo(1);
        });

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var response = http.getForEntity(mailpitApi("/api/v1/messages?limit=50"), String.class);
            assertThat(response.getBody()).contains("it-news@demo.vn");
            assertThat(response.getBody()).contains("Chào mừng");
        });
    }

    @Test
    void redeliveryCungEventIdChiMotEmail() throws Exception {
        UUID eventId = UUID.randomUUID();
        Map<String, Object> payload = Map.of(
            "email", "it-news-dup@demo.vn",
            "subscribedAt", java.time.Instant.now().toString());
        sendRaw(rabbit, om, "user.newsletter_subscribed", eventId, payload);
        sendRaw(rabbit, om, "user.newsletter_subscribed", eventId, payload);

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid AND status = 'SENT'",
                Integer.class, eventId.toString());
            assertThat(sent).isEqualTo(1);
        });
    }

    private String mailpitApi(String path) {
        return "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + path;
    }
}
