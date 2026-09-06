package com.ecommerce.affiliate;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.listener.RabbitListenerEndpointRegistry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ecommerce.common.event.EventEnvelope;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT ledger consumer (SF-12, pack mục 3/IT): publish synthetic order.confirmed
 * QUA exchange thật {@code ecommerce.events} (pattern VerifiedPurchaseITTest
 * SF-8) → consumer tạo ledger entry đúng rate; idempotent re-delivery không
 * double; order.cancelled/failed gỡ entry PENDING; code lạ/suspend → skip;
 * admin đổi rate → đơn sau dùng rate mới, entry cũ giữ nguyên.
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
class AffiliateLedgerConsumerTest extends AbstractIntegrationTest {

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void rabbit(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        // Consumer thật chạy — override base tắt listener (dynamic THẮNG base)
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "true");
    }

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;
    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    RabbitListenerEndpointRegistry rabbitListeners;
    @Autowired
    ObjectMapper om;

    @Test
    void ledgerTaoDungRateIdempotentVaGozKhiCancel() throws Exception {
        String admin = mintToken("it-admin", "ADMIN");
        String user = UUID.randomUUID().toString();
        String token = mintToken(user, "CUSTOMER");

        // đăng ký + approve (rate mặc định 5)
        String id = om.readTree(post("/api/affiliate/register", token, Map.of("note", "ledger")).getBody())
            .get("id").asText();
        String code = om.readTree(
            post("/api/affiliate/admin/affiliates/" + id + "/approve", admin, null).getBody())
            .get("code").asText();

        startListeners();

        // 1) order.confirmed total 200.000 → commission floor(200000×5/100) = 10.000 PENDING
        UUID order1 = UUID.randomUUID();
        UUID event1 = UUID.randomUUID();
        publishConfirmed(event1, order1, 200_000, code);
        awaitLedger(order1, 10_000, "PENDING");
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT commission, status, order_total, rate FROM ledger WHERE order_id = ?", order1.toString());
        assertThat(((Number) row.get("commission")).longValue()).isEqualTo(10_000L);
        assertThat(row.get("status")).isEqualTo("PENDING");
        assertThat(((Number) row.get("order_total")).longValue()).isEqualTo(200_000L);
        assertThat(new java.math.BigDecimal(row.get("rate").toString()).doubleValue()).isEqualTo(5.0);
        assertThat(ledgerAffiliateId(order1.toString())).isEqualTo(affiliateIdOf(user));

        // stats /me: conversions 1, earnings 10.000
        JsonNode me = om.readTree(get("/api/affiliate/me", token).getBody());
        assertThat(me.get("stats").get("conversions").asInt()).isEqualTo(1);
        assertThat(me.get("stats").get("earnings").asLong()).isEqualTo(10_000L);

        // 2) idempotent — re-delivery CÙNG eventId → vẫn 1 entry
        publishConfirmed(event1, order1, 200_000, code);
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        awaitLedgerCount(order1, 1);

        // 3) đổi rate 10 → order MỚI dùng rate mới; entry cũ giữ 5%
        assertThat(putRate(id, "10", admin)).isEqualTo(200);
        UUID order2 = UUID.randomUUID();
        publishConfirmed(UUID.randomUUID(), order2, 50_000, code);
        awaitLedger(order2, 5_000, "PENDING");   // floor(50000×10/100)
        assertThat(jdbc.queryForObject(
            "SELECT commission FROM ledger WHERE order_id = ?", Long.class, order1.toString()))
            .isEqualTo(10_000L);   // ledger cũ giữ rate cũ (contract)

        // earnings cập nhật: 10.000 + 5.000
        JsonNode me2 = om.readTree(get("/api/affiliate/me", token).getBody());
        assertThat(me2.get("stats").get("earnings").asLong()).isEqualTo(15_000L);
        assertThat(me2.get("stats").get("conversions").asInt()).isEqualTo(2);

        // 4) order.cancelled → gỡ entry PENDING của order2
        publishTerminal("order.cancelled", order2);
        awaitLedgerGone(order2);
        JsonNode me3 = om.readTree(get("/api/affiliate/me", token).getBody());
        assertThat(me3.get("stats").get("earnings").asLong()).isEqualTo(10_000L);

        // 5) order.failed → gỡ tương tự (order1 tạo lại tình huống race)
        publishTerminal("order.failed", order1);
        awaitLedgerGone(order1);

        // 6) code lạ → skip im lặng, không crash queue
        publishConfirmed(UUID.randomUUID(), UUID.randomUUID(), 999_000, "ZZZZZZ99");
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM ledger WHERE order_total = 999000", Long.class)).isZero();

        // 7) suspend → confirmed lúc SUSPENDED không tính
        assertThat(post("/api/affiliate/admin/affiliates/" + id + "/suspend", admin, null)
            .getStatusCode().value()).isEqualTo(200);
        UUID order3 = UUID.randomUUID();
        publishConfirmed(UUID.randomUUID(), order3, 300_000, code);
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM ledger WHERE order_id = ?", Long.class, order3.toString())).isZero();

        // 8) đơn KHÔNG affiliate (affiliateCode null) → không entry — đường chính
        publishConfirmed(UUID.randomUUID(), UUID.randomUUID(), 123_000, null);
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM ledger WHERE order_total = 123000", Long.class)).isZero();
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private void startListeners() {
        rabbitListeners.getListenerContainers().forEach(container -> {
            try {
                if (!container.isRunning()) {
                    container.start();
                }
            } catch (Exception e) {
                throw new IllegalStateException("start listener container lỗi", e);
            }
        });
    }

    /**
     * Publish envelope order.confirmed khít schema frozen qua exchange thật —
     * raw Message như OutboxRelay (contentType JSON, KHÔNG __TypeId__ header —
     * convertAndSend(String) gắn __TypeId__=java.lang.String làm converter
     * listener fromMessage fail trước khi tới business).
     */
    private void publishConfirmed(UUID eventId, UUID orderId, long total, String affiliateCode) throws Exception {
        Map<String, Object> item = new HashMap<>();
        item.put("productId", UUID.randomUUID().toString());
        item.put("variantId", UUID.randomUUID().toString());
        item.put("qty", 1);
        item.put("price", total);
        item.put("name", "IT synthetic item");
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", orderId.toString());
        payload.put("userId", UUID.randomUUID().toString());
        payload.put("email", "it-ledger@demo.local");
        payload.put("items", java.util.List.of(item));
        payload.put("subtotal", total);
        payload.put("discount", 0);
        payload.put("shippingFee", 0);
        payload.put("total", total);
        payload.put("currency", "VND");
        payload.put("affiliateCode", affiliateCode);   // nullable — null = đơn thường
        payload.put("confirmedAt", java.time.Instant.now().toString());

        var envelope = new EventEnvelope(eventId, "order.confirmed", java.time.Instant.now(),
            "it-" + eventId, "it-synthetic", 1, om.valueToTree(payload));
        sendRawMessage("order.confirmed", om.writeValueAsString(envelope), eventId);
    }

    private void publishTerminal(String eventType, UUID orderId) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", orderId.toString());
        payload.put("reason", "it_synthetic");
        var envelope = new EventEnvelope(UUID.randomUUID(), eventType, java.time.Instant.now(),
            "it-terminal-" + orderId, "it-synthetic", 1, om.valueToTree(payload));
        sendRawMessage(eventType, om.writeValueAsString(envelope), orderId);
    }

    private void sendRawMessage(String routingKey, String envelopeJson, UUID messageId) {
        MessageProperties properties = new MessageProperties();
        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        properties.setMessageId(String.valueOf(messageId));
        properties.setHeader("eventType", routingKey);
        rabbit.send("ecommerce.events", routingKey,
            new org.springframework.amqp.core.Message(envelopeJson.getBytes(StandardCharsets.UTF_8), properties));
    }

    private void awaitLedger(UUID orderId, long expectedCommission, String expectedStatus)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            Long count = jdbc.queryForObject("SELECT count(*) FROM ledger WHERE order_id = ?",
                Long.class, orderId.toString());
            if (count != null && count == 1) {
                return;
            }
            Thread.sleep(200);
        }
        org.assertj.core.api.Assertions.fail("ledger cho order " + orderId + " không xuất hiện");
    }

    private void awaitLedgerCount(UUID orderId, int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        Long count = -1L;
        while (System.currentTimeMillis() < deadline) {
            count = jdbc.queryForObject("SELECT count(*) FROM ledger WHERE order_id = ?",
                Long.class, orderId.toString());
            if (count != null && count == expected) {
                return;
            }
            Thread.sleep(200);
        }
        org.assertj.core.api.Assertions.fail("ledger count của " + orderId + " không đạt " + expected);
    }

    private void awaitLedgerGone(UUID orderId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            Long count = jdbc.queryForObject("SELECT count(*) FROM ledger WHERE order_id = ?",
                Long.class, orderId.toString());
            if (count != null && count == 0) {
                return;
            }
            Thread.sleep(200);
        }
        org.assertj.core.api.Assertions.fail("ledger của " + orderId + " chưa bị gỡ");
    }

    private UUID ledgerAffiliateId(String orderId) {
        return UUID.fromString(jdbc.queryForObject(
            "SELECT affiliate_id FROM ledger WHERE order_id = ?", String.class, orderId));
    }

    // awaitLedger(orderId, expectedCommission, expectedStatus) — poll tồn tại;
    // commission/status/order_total assert ngay sau đó bằng queryForMap.

    private UUID affiliateIdOf(String userId) {
        return UUID.fromString(jdbc.queryForObject(
            "SELECT id FROM affiliates WHERE user_id = ?", String.class, UUID.fromString(userId)));
    }

    private ResponseEntity<String> post(String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        return http.exchange("http://localhost:" + port + path, HttpMethod.POST,
            new HttpEntity<>(body, headers), String.class);
    }

    private ResponseEntity<String> get(String path, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return http.exchange("http://localhost:" + port + path, HttpMethod.GET,
            new HttpEntity<>(headers), String.class);
    }

    private int putRate(String id, String rate, String admin) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(admin);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange("http://localhost:" + port + "/api/affiliate/admin/affiliates/" + id + "/rate",
            HttpMethod.PUT, new HttpEntity<>(Map.of("rate", rate), headers), String.class)
            .getStatusCode().value();
    }
}
