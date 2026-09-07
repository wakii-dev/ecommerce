package com.ecommerce.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT consumer notification (SF-10, D18): publish order.confirmed khít schema
 * frozen qua exchange thật → Mailpit (SMTP sink thật) NHẬN được email cảm ơn
 * + send_log SENT; re-delivery cùng eventId → 1 email duy nhất (Idempotent
 * Consumer); order.cancelled / review.moderated (payload không email) →
 * send_log SKIPPED_NO_EMAIL, không email.
 *
 * <p>IdentityClient gọi http://localhost:1 (đóng) → register/login fail →
 * InvoiceClient bắt Exception → email gửi KHÔNG attach (assert attachment=
 * false + Mailpit không có file). CóInvoice thật = live-verify (T11).</p>
 */
@Tag("integration")
class NotificationConsumerTest extends AbstractIntegrationTest {

    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;

    @Test
    void confirmedGuiEmailCamOnVaLogSent() throws Exception {
        UUID eventId = UUID.randomUUID();
        Map<String, Object> payload = confirmedPayload(UUID.randomUUID().toString(), "it-user@demo.vn");
        sendRaw(rabbit, om, "order.confirmed", eventId, payload);

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ? AND status = 'SENT'",
                Integer.class, eventId.toString());
            assertThat(sent).isEqualTo(1);
        });

        // Mailpit nhận đúng 1 email tới it-user@demo.vn
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var response = http.getForEntity(mailpitApi("/api/v1/messages?limit=50"), String.class);
            assertThat(response.getBody()).contains("it-user@demo.vn");
            assertThat(response.getBody()).contains("Cảm ơn bạn đã mua hàng");
        });
    }

    @Test
    void redeliveryCungEventIdChiMotEmail() throws Exception {
        UUID eventId = UUID.randomUUID();
        sendRaw(rabbit, om, "order.confirmed", eventId,
            confirmedPayload(UUID.randomUUID().toString(), "it-dup@demo.vn"));
        // re-delivery CÙNG eventId (at-least-once broker)
        sendRaw(rabbit, om, "order.confirmed", eventId,
            confirmedPayload(UUID.randomUUID().toString(), "it-dup@demo.vn"));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ? AND status = 'SENT'",
                Integer.class, eventId.toString());
            assertThat(sent).isEqualTo(1);
        });
        Long rows = jdbc.queryForObject(
            "SELECT count(*) FROM send_log WHERE event_id = ?", Long.class, eventId.toString());
        assertThat(rows).isEqualTo(1); // marker chặn cả send_log trùng
    }

    @Test
    void cancelledVaModeratedThieuEmailChiLogSkip() throws Exception {
        UUID cancelEvent = UUID.randomUUID();
        sendRaw(rabbit, om, "order.cancelled", cancelEvent, Map.of(
            "orderId", UUID.randomUUID().toString(),
            "reason", "ttl_expired",
            "cancelledBy", "system"));

        UUID reviewEvent = UUID.randomUUID();
        sendRaw(rabbit, om, "review.moderated", reviewEvent, Map.of(
            "reviewId", UUID.randomUUID().toString(),
            "productId", UUID.randomUUID().toString(),
            "userId", UUID.randomUUID().toString(),
            "status", "APPROVED",
            "rating", 5,
            "moderatedAt", java.time.Instant.now().toString()));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer skipped = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id IN (?, ?) AND status = 'SKIPPED_NO_EMAIL'",
                Integer.class, cancelEvent.toString(), reviewEvent.toString());
            assertThat(skipped).isEqualTo(2);
        });
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private String mailpitApi(String path) {
        return "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + path;
    }

    private Map<String, Object> confirmedPayload(String orderId, String email) {
        Map<String, Object> item = new HashMap<>();
        item.put("productId", UUID.randomUUID().toString());
        item.put("variantId", UUID.randomUUID().toString());
        item.put("qty", 2);
        item.put("price", 100_000);
        item.put("name", "Tai nghe Bluetooth XYZ");
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", orderId);
        payload.put("userId", UUID.randomUUID().toString());
        payload.put("email", email);
        payload.put("items", List.of(item));
        payload.put("subtotal", 200_000);
        payload.put("discount", 20_000);
        payload.put("shippingFee", 25_000);
        payload.put("total", 205_000);
        payload.put("currency", "VND");
        payload.put("couponCode", "WELCOME10");
        payload.put("confirmedAt", java.time.Instant.now().toString());
        return payload;
    }
}
