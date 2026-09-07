package com.ecommerce.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * IT consumer password reset (SF-13 A1): publish user.password_reset_requested
 * qua exchange thật → Mailpit nhận email link reset (chứa /reset-password?token=)
 * + send_log SENT; re-delivery cùng eventId → 1 email duy nhất.
 */
@Tag("integration")
class PasswordResetConsumerTest extends AbstractIntegrationTest {

    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;

    @Test
    void resetRequestGuiEmailLinkVaLogSent() throws Exception {
        UUID eventId = UUID.randomUUID();
        sendRaw(rabbit, om, "user.password_reset_requested", eventId, Map.of(
            "email", "it-reset@demo.vn",
            "token", "it-token-abc-123",
            "expiresAt", java.time.Instant.now().plusSeconds(1800).toString()));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid AND status = 'SENT'",
                Integer.class, eventId.toString());
            assertThat(sent).isEqualTo(1);
        });

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var response = http.getForEntity(mailpitApi("/api/v1/messages?limit=50"), String.class);
            assertThat(response.getBody()).contains("it-reset@demo.vn");
            assertThat(response.getBody()).contains("Đặt lại mật khẩu");
        });

        // Body: link chứa token — Mailpit list KHÔNG trả body → fetch message detail
        String list = http.getForEntity(mailpitApi("/api/v1/messages?limit=50"), String.class).getBody();
        String id = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
            .readTree(list).path("messages").get(0).path("ID").asText();
        var detail = http.getForEntity(mailpitApi("/api/v1/message/" + id), String.class);
        assertThat(detail.getBody()).contains("/reset-password?token=");
        assertThat(detail.getBody()).contains("it-token-abc-123");
    }

    @Test
    void redeliveryCungEventIdChiMotEmail() throws Exception {
        UUID eventId = UUID.randomUUID();
        sendRaw(rabbit, om, "user.password_reset_requested", eventId, Map.of(
            "email", "it-reset-dup@demo.vn",
            "token", "dup-token",
            "expiresAt", java.time.Instant.now().plusSeconds(1800).toString()));
        sendRaw(rabbit, om, "user.password_reset_requested", eventId, Map.of(
            "email", "it-reset-dup@demo.vn",
            "token", "dup-token",
            "expiresAt", java.time.Instant.now().plusSeconds(1800).toString()));

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
