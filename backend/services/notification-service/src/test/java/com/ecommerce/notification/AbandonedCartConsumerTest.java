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
 * IT consumer abandoned cart (SF-13 A4): envelope cart.abandoned → Mailpit
 * nhận mail đúng to + subject "Giỏ hàng của bạn"; payload thiếu email →
 * SKIPPED_NO_EMAIL; re-delivery cùng eventId → 1 mail (idempotent).
 */
@Tag("integration")
class AbandonedCartConsumerTest extends AbstractIntegrationTest {

    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;

    @Test
    void abandonedCart_guiMailDungNguoiNhan() throws Exception {
        UUID eventId = UUID.randomUUID();
        sendRaw(rabbit, om, "cart.abandoned", eventId, Map.of(
            "userId", UUID.randomUUID().toString(),
            "email", "it-abandoned@demo.vn",
            "itemCount", 3,
            "updatedAt", java.time.Instant.now().minus(Duration.ofHours(2)).toString()));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid AND status = 'SENT'",
                Integer.class, eventId.toString());
            assertThat(sent).isEqualTo(1);
        });

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var response = http.getForEntity(mailpitApi("/api/v1/messages?limit=50"), String.class);
            assertThat(response.getBody()).contains("it-abandoned@demo.vn");
            assertThat(response.getBody()).contains("Giỏ hàng của bạn");
        });
    }

    @Test
    void thieuEmail_skippedVaDupEventIdMotMail() throws Exception {
        // payload thiếu email → SKIPPED_NO_EMAIL
        UUID skipId = UUID.randomUUID();
        sendRaw(rabbit, om, "cart.abandoned", skipId, Map.of(
            "userId", UUID.randomUUID().toString(),
            "itemCount", 1));
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            java.util.List<String> statuses = jdbc.queryForList(
                "SELECT status FROM send_log WHERE event_id = ?::uuid", String.class, skipId.toString());
            assertThat(statuses).containsExactly("SKIPPED_NO_EMAIL");
        });

        // dup eventId → 1 mail duy nhất
        UUID dupId = UUID.randomUUID();
        sendRaw(rabbit, om, "cart.abandoned", dupId, Map.of(
            "userId", UUID.randomUUID().toString(),
            "email", "it-abandoned-dup@demo.vn",
            "itemCount", 2));
        sendRaw(rabbit, om, "cart.abandoned", dupId, Map.of(
            "userId", UUID.randomUUID().toString(),
            "email", "it-abandoned-dup@demo.vn",
            "itemCount", 2));
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Long rows = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid", Long.class, dupId.toString());
            assertThat(rows).isEqualTo(1);
        });
    }

    private String mailpitApi(String path) {
        return "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + path;
    }
}
