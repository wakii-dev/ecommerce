package com.ecommerce.notification;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * IT email RMA (SF-14, D22 — pack item 5 + IT "emails trigger đúng"):
 * publish rma.approved/refunded qua exchange thật → Mailpit nhận email đúng
 * template + send_log SENT; payload thiếu email → SKIPPED_NO_EMAIL.
 */
@Tag("integration")
class RmaEmailTest extends AbstractIntegrationTest {

    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;

    @Test
    void rmaApprovedAndRefunded_guiDungTemplateVaLogSent() throws Exception {
        UUID approved = UUID.randomUUID();
        sendRaw(rabbit, om, "rma.approved", approved, rmaPayload("APPROVED", null));

        UUID refunded = UUID.randomUUID();
        sendRaw(rabbit, om, "rma.refunded", refunded, rmaPayload("REFUNDED", 320_000L));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id IN (?::uuid, ?::uuid) AND status = 'SENT'",
                Integer.class, approved.toString(), refunded.toString());
            assertThat(sent).isEqualTo(2);
        });

        // Mailpit: 1 email duyệt + 1 email hoàn tiền tới đúng người nhận
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var response = http.getForEntity(mailpitApi("/api/v1/messages?limit=50"), String.class);
            assertThat(response.getBody()).contains("it-rma@demo.vn");
            assertThat(response.getBody()).contains("được DUYỆT");
            assertThat(response.getBody()).contains("HOÀN TIỀN");
        });
    }

    @Test
    void rmaRejected_guiEmailTuChoi() throws Exception {
        UUID rejected = UUID.randomUUID();
        sendRaw(rabbit, om, "rma.rejected", rejected, rmaPayload("REJECTED", null));

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid AND status = 'SENT'",
                Integer.class, rejected.toString());
            assertThat(sent).isEqualTo(1);
        });
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var response = http.getForEntity(mailpitApi("/api/v1/messages?limit=50"), String.class);
            assertThat(response.getBody()).contains("TỪ CHỐI");
        });
    }

    @Test
    void rmaThieuEmail_logSkip() throws Exception {
        UUID noEmail = UUID.randomUUID();
        Map<String, Object> payload = rmaPayload("RECEIVED", null);
        payload.remove("email");
        sendRaw(rabbit, om, "rma.received", noEmail, payload);

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Integer skipped = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid AND status = 'SKIPPED_NO_EMAIL'",
                Integer.class, noEmail.toString());
            assertThat(skipped).isEqualTo(1);
        });
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private String mailpitApi(String path) {
        return "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + path;
    }

    /** Payload FAT khớp ordering RmaService.payload() — rma.<status>. */
    private Map<String, Object> rmaPayload(String status, Long refundAmount) {
        Map<String, Object> line = new HashMap<>();
        line.put("lineId", UUID.randomUUID().toString());
        line.put("qty", 1);
        Map<String, Object> payload = new HashMap<>();
        payload.put("rmaId", UUID.randomUUID().toString());
        payload.put("orderId", UUID.randomUUID().toString());
        payload.put("userId", UUID.randomUUID().toString());
        payload.put("email", "it-rma@demo.vn");
        payload.put("status", status);
        payload.put("reason", "Sai mẫu - muốn trả hàng");
        payload.put("lines", List.of(line));
        if (refundAmount != null) {
            payload.put("refundAmount", refundAmount);
        }
        payload.put("occurredAt", java.time.Instant.now().toString());
        return payload;
    }
}
