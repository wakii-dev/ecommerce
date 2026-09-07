package com.ecommerce.affiliate;

import com.ecommerce.common.event.EventEnvelope;
import com.fasterxml.jackson.databind.JsonNode;
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

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT loyalty slice (SF-14, D22 — pack IT item 4): earn qua order.confirmed
 * trên Rabbit THẬT (pattern AffiliateLedgerConsumerTest), idempotent theo
 * eventId + UNIQUE(order,type); redeem nguyên tử (2 concurrent — 1 thắng);
 * hoàn điểm khi order.cancelled (REDEEM) và thu hồi earn; me/admin endpoints
 * + adjust; sai X-Internal-Token → 403.
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
class LoyaltyEarnRedeemTest extends AbstractIntegrationTest {

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void rabbit(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "true");
        registry.add("affiliate.loyalty.internal-token", () -> "it-internal-token");
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
    com.fasterxml.jackson.databind.ObjectMapper om;

    // ── 1. Earn → balance; redelivery không double; cancel → hoàn/thu hồi ───

    @Test
    void earnIdempotent_redeemAtomic_cancelRestoresPoints() throws Exception {
        String user = UUID.randomUUID().toString();
        UUID order = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        startListeners();

        // 1) order.confirmed total 1.000.000 → earn floor(1M × 1% / 100đ) = 100 điểm
        publishConfirmed(event, order, user, 1_000_000);
        awaitLedger(order.toString(), "EARN", 1);
        assertThat(balance(user)).isEqualTo(100);
        assertThat(totalEarned(user)).isEqualTo(100);

        // 2) re-delivery CÙNG eventId → vẫn 1 entry, balance không đổi
        publishConfirmed(event, order, user, 1_000_000);
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        assertThat(ledgerCount(order.toString(), "EARN")).isEqualTo(1);
        assertThat(balance(user)).isEqualTo(100);

        // 3) redeem 40 điểm cho đơn → discount 4.000đ, còn 60
        ResponseEntity<String> redeem = redeem(user, 40, UUID.randomUUID().toString());
        assertThat(redeem.getStatusCode().value()).isEqualTo(200);
        JsonNode result = om.readTree(redeem.getBody());
        assertThat(result.path("discount").asLong()).isEqualTo(4_000);
        assertThat(result.path("remaining").asLong()).isEqualTo(60);

        // 4) redeem LẠI cùng đơn (orderId trùng) → 409
        String dupOrderId = UUID.randomUUID().toString();
        assertThat(redeem(user, 10, dupOrderId).getStatusCode().value()).isEqualTo(200);
        assertThat(redeem(user, 10, dupOrderId).getStatusCode().value()).isEqualTo(409);

        // 5) thiếu điểm → 409 (balance 50 sau redeem 10)
        assertThat(redeem(user, 999, UUID.randomUUID().toString()).getStatusCode().value())
            .isEqualTo(409);

        // 6) order.cancelled → thu hồi EARN của đơn (REDEEM của đơn khác không đụng);
        // balance clamp 0 vì 50 điểm còn lại < 100 earn thu hồi (repo revokeEarn)
        publishTerminal("order.cancelled", order);
        awaitBalance(user, 0);
        assertThat(totalEarned(user)).isZero();
        assertThat(ledgerCount(order.toString(), "EARN")).isZero();

        // 7) order.failed với đơn KHÔNG có ledger → no-op an toàn
        publishTerminal("order.failed", UUID.randomUUID());
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        assertThat(balance(user)).isZero();
    }

    // ── 2. Concurrent redeem: balance không bao giờ âm (pack: "trừ nguyên tử") ──

    @Test
    void concurrentRedeem_onlyOneWinsWhenBalanceJustEnough() throws Exception {
        String user = UUID.randomUUID().toString();
        // Nạp 60 điểm bằng ADJUST admin
        assertThat(adjust(user, 60, "it seed").getStatusCode().value()).isEqualTo(200);

        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger wins = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        Thread t1 = new Thread(() -> tryRedeem(user, 60, start, wins, conflicts));
        Thread t2 = new Thread(() -> tryRedeem(user, 60, start, wins, conflicts));
        t1.start();
        t2.start();
        start.countDown();
        t1.join(30_000);
        t2.join(30_000);

        assertThat(wins.get()).isEqualTo(1);
        assertThat(conflicts.get()).isEqualTo(1);
        assertThat(balance(user)).isZero();
    }

    // ── 3. Endpoints me/admin + token guard ─────────────────────────────────

    @Test
    void meAndAdminEndpoints_adjust_andInternalTokenGuard() throws Exception {
        String admin = mintToken(UUID.randomUUID().toString(), "ADMIN");
        String user = UUID.randomUUID().toString();
        String customer = mintToken(user, "CUSTOMER");

        // me/loyalty khi chưa có account → balance 0
        ResponseEntity<String> me = get("/api/affiliate/me/loyalty", customer);
        assertThat(me.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(me.getBody()).path("balance").asLong()).isZero();

        // admin tra cứu + adjust
        assertThat(adjust(user, 250, "khuyến mãi").getStatusCode().value()).isEqualTo(200);
        ResponseEntity<String> lookup = get("/api/affiliate/admin/loyalty?userId=" + user, admin);
        assertThat(lookup.getStatusCode().value()).isEqualTo(200);
        JsonNode adminView = om.readTree(lookup.getBody());
        assertThat(adminView.path("account").path("balance").asLong()).isEqualTo(250);
        assertThat(adminView.path("ledger").size()).isEqualTo(1);

        // adjust âm quá balance → 400
        assertThat(adjust(user, -1000, "âm").getStatusCode().value()).isEqualTo(400);
        // customer gọi admin → 403
        assertThat(get("/api/affiliate/admin/loyalty?userId=" + user, customer)
            .getStatusCode().value()).isEqualTo(403);

        // internal redeem SAI token → 403
        HttpHeaders bad = new HttpHeaders();
        bad.setContentType(MediaType.APPLICATION_JSON);
        bad.set("X-Internal-Token", "wrong-token");
        ResponseEntity<String> forbidden = http.exchange(
            "http://localhost:" + port + "/api/affiliate/internal/loyalty/redeem", HttpMethod.POST,
            new HttpEntity<>(Map.of("userId", user, "points", 1, "orderId",
                UUID.randomUUID().toString()), bad), String.class);
        assertThat(forbidden.getStatusCode().value()).isEqualTo(403);
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

    private void publishConfirmed(UUID eventId, UUID orderId, String userId, long total) throws Exception {
        Map<String, Object> item = new HashMap<>();
        item.put("productId", UUID.randomUUID().toString());
        item.put("variantId", UUID.randomUUID().toString());
        item.put("qty", 1);
        item.put("price", total);
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", orderId.toString());
        payload.put("userId", userId);
        payload.put("email", "it-loyalty@demo.local");
        payload.put("items", java.util.List.of(item));
        payload.put("subtotal", total);
        payload.put("discount", 0);
        payload.put("shippingFee", 0);
        payload.put("total", total);
        payload.put("currency", "VND");
        payload.put("confirmedAt", java.time.Instant.now().toString());
        var envelope = new EventEnvelope(eventId, "order.confirmed", java.time.Instant.now(),
            "it-" + eventId, "it-synthetic", 1, om.valueToTree(payload));
        sendRaw("order.confirmed", om.writeValueAsString(envelope), eventId);
    }

    private void publishTerminal(String eventType, UUID orderId) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", orderId.toString());
        payload.put("reason", "it_synthetic");
        var envelope = new EventEnvelope(UUID.randomUUID(), eventType, java.time.Instant.now(),
            "it-terminal-" + orderId, "it-synthetic", 1, om.valueToTree(payload));
        sendRaw(eventType, om.writeValueAsString(envelope), UUID.randomUUID());
    }

    private void sendRaw(String routingKey, String envelopeJson, UUID messageId) {
        MessageProperties properties = new MessageProperties();
        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        properties.setMessageId(String.valueOf(messageId));
        properties.setHeader("eventType", routingKey);
        rabbit.send("ecommerce.events", routingKey,
            new org.springframework.amqp.core.Message(envelopeJson.getBytes(StandardCharsets.UTF_8), properties));
    }

    private long balance(String userId) {
        Long value = jdbc.queryForObject(
            "SELECT COALESCE((SELECT balance FROM loyalty_accounts WHERE user_id = ?::uuid), 0)",
            Long.class, userId);
        return value == null ? 0 : value;
    }

    private long totalEarned(String userId) {
        Long value = jdbc.queryForObject(
            "SELECT COALESCE((SELECT total_earned FROM loyalty_accounts WHERE user_id = ?::uuid), 0)",
            Long.class, userId);
        return value == null ? 0 : value;
    }

    private int ledgerCount(String orderId, String type) {
        Integer count = jdbc.queryForObject(
            "SELECT count(*) FROM loyalty_ledger WHERE order_id = ? AND type = ?",
            Integer.class, orderId, type);
        return count == null ? 0 : count;
    }

    private void awaitLedger(String orderId, String type, int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            if (ledgerCount(orderId, type) == expected) {
                return;
            }
            Thread.sleep(200);
        }
        org.assertj.core.api.Assertions.fail("ledger " + type + " của " + orderId + " không đạt " + expected);
    }

    private void awaitBalance(String userId, long expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            if (balance(userId) == expected) {
                return;
            }
            Thread.sleep(200);
        }
        org.assertj.core.api.Assertions.fail("balance của " + userId + " không đạt " + expected);
    }

    private ResponseEntity<String> redeem(String userId, long points, String orderId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Token", "it-internal-token");
        return http.exchange("http://localhost:" + port + "/api/affiliate/internal/loyalty/redeem",
            HttpMethod.POST, new HttpEntity<>(
                Map.of("userId", userId, "points", points, "orderId", orderId), headers), String.class);
    }

    private void tryRedeem(String user, long points, CountDownLatch start,
                           AtomicInteger wins, AtomicInteger conflicts) {
        try {
            start.await();
            ResponseEntity<String> response = redeem(user, points, UUID.randomUUID().toString());
            if (response.getStatusCode().value() == 200) {
                wins.incrementAndGet();
            } else if (response.getStatusCode().value() == 409) {
                conflicts.incrementAndGet();
            }
        } catch (Exception e) {
            // ignore — assert thắng/thua sẽ bắt
        }
    }

    private ResponseEntity<String> adjust(String user, long points, String note) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintToken(UUID.randomUUID().toString(), "ADMIN"));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange("http://localhost:" + port + "/api/affiliate/admin/loyalty/adjust",
            HttpMethod.POST, new HttpEntity<>(Map.of("userId", user, "points", points,
                "note", note), headers), String.class);
    }

    private ResponseEntity<String> get(String path, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return http.exchange("http://localhost:" + port + path, HttpMethod.GET,
            new HttpEntity<>(headers), String.class);
    }
}
