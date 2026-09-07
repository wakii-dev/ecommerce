package com.ecommerce.ordering;

import com.fasterxml.jackson.databind.JsonNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

import java.time.Duration;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT loyalty burn checkout (SF-14, D22 — pack IT item 4 phần redeem):
 * ordering gọi affiliate THẬT không boot được trong saga JVM → affiliate
 * WireMock double trên path FROZEN /api/affiliate/internal/loyalty/redeem
 * (side affiliate thật có LoyaltyEarnRedeemTest riêng):
 *
 * <ul>
 *   <li>usePoints → total giảm pointsDiscount, cột points_discount lưu đúng,
 *       intent Stripe với amount ĐÃ trừ điểm, order.confirmed.discount = coupon+điểm</li>
 *   <li>409 từ affiliate (điểm không đủ) → 422 cho client + order FAILED</li>
 * </ul>
 */
class LoyaltyCheckoutTest extends AbstractSagaTest {

    static final WireMockServer AFFILIATE = new WireMockServer(options().dynamicPort());

    @BeforeAll
    static void startAffiliate() {
        AFFILIATE.start();
    }

    @AfterAll
    static void stopAffiliate() {
        AFFILIATE.stop();
    }

    @DynamicPropertySource
    static void loyaltyProps(DynamicPropertyRegistry registry) {
        registry.add("ordering.loyalty.base-url", AFFILIATE::baseUrl);
        registry.add("ordering.loyalty.internal-token", () -> "it-internal-token");
    }

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    com.fasterxml.jackson.databind.ObjectMapper om;

    @BeforeEach
    void reset() {
        seedStock(VARIANT_A, STOCK_A);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private String createOrderBody(int usePoints) {
        return """
            {"items":[{"productId":"%s","variantId":"%s","qty":2}],
             "usePoints":%d,
             "paymentMethod":"stripe","shippingMethod":"standard",
             "address":{"fullName":"Nguyễn Văn Điểm","phone":"0901234567","line1":"45 Lê Lợi",
               "ward":"Bến Nghé","district":"Quận 1","city":"TP. Hồ Chí Minh"}}
            """.formatted(PRODUCT_A, VARIANT_A, usePoints);
    }

    private ResponseEntity<String> createOrder(String token, String idem, int usePoints) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        headers.set("Idempotency-Key", idem);
        return rest.exchange("/orders", HttpMethod.POST,
            new HttpEntity<>(createOrderBody(usePoints), headers), String.class);
    }

    private void stubIntent() {
        STRIPE.stubFor(post(urlEqualTo("/v1/payment_intents")).willReturn(okJson(
            ("{\"id\":\"pi_%s\",\"object\":\"payment_intent\",\"amount\":1,\"currency\":\"vnd\","
                + "\"status\":\"requires_payment_method\",\"client_secret\":\"cs_test_it\",\"livemode\":false}")
                .formatted(UUID.randomUUID().toString().replace("-", "").substring(0, 12)))));
    }

    private void untilAsserted(org.awaitility.core.ThrowingRunnable assertion) {
        Awaitility.await().atMost(Duration.ofSeconds(20))
            .pollInterval(Duration.ofMillis(200))
            .untilAsserted(assertion);
    }

    private String scalar(String sql, Object... args) {
        return jdbc.queryForObject(sql, String.class, uuidArgs(args));
    }

    // ── 1. Dùng 100 điểm → giảm 10.000đ (1 điểm = 100đ, spec D3) ────────────

    @Test
    void checkoutWithPoints_totalReduced_confirmedDiscountIncludesPoints() throws Exception {
        // affiliate redeem OK: 100 điểm → discount 10.000đ
        AFFILIATE.stubFor(post(urlEqualTo("/api/affiliate/internal/loyalty/redeem"))
            .withRequestBody(containing("\"points\":100"))
            .willReturn(okJson("{\"discount\":10000,\"remaining\":900}")));
        stubIntent();
        String token = customerJwt("points@ecommerce.local");

        ResponseEntity<String> created = createOrder(token, UUID.randomUUID().toString(), 100);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        JsonNode order = om.readTree(created.getBody()).path("order");
        // subtotal 300.000 (2×150.000) − điểm 10.000 + ship 20.000 = 310.000
        assertThat(order.path("pointsDiscount").asLong()).isEqualTo(10_000);
        assertThat(order.path("total").asLong()).isEqualTo(310_000);
        String orderId = order.path("id").asText();
        assertThat(scalar("SELECT points_discount FROM orders WHERE id = ?", orderId))
            .isEqualTo("10000");

        // Pay → CONFIRMED — order.confirmed.discount = coupon + điểm (D11, coupon 0)
        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);
        rest.exchange("http://localhost:" + paymentPort + "/payment/webhook", HttpMethod.POST,
            signedWebhook(webhookEvent("payment_intent.succeeded", pi, 310_000)), String.class);
        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CONFIRMED"));
        // jsonb: envelope top-level không có orderId — nằm ở payload->payload->orderId
        String confirmed = scalar(
            "SELECT payload::text FROM outbox WHERE event_type = 'order.confirmed' AND payload->'payload'->>'orderId' = '"
                + orderId + "'");
        JsonNode payload = om.readTree(confirmed).path("payload");
        assertThat(payload.path("discount").asLong()).isEqualTo(10_000);
        assertThat(payload.path("total").asLong()).isEqualTo(310_000);
    }

    // ── 2. Affiliate 409 (điểm không đủ) → 422 + order FAILED + compensation ──

    @Test
    void insufficientPoints_422_orderFailed() {
        // Stub theo points riêng (3000 = cap (subtotal-coupon)/100) — không đè stub khác
        AFFILIATE.stubFor(post(urlEqualTo("/api/affiliate/internal/loyalty/redeem"))
            .withRequestBody(containing("\"points\":3000"))
            .willReturn(aResponse()
                .withStatus(409)
                .withHeader("Content-Type", "application/problem+json")
                .withBody("{\"type\":\"about:blank\",\"title\":\"Conflict\","
                    + "\"status\":409,\"detail\":\"Điểm không đủ\"}")));
        stubIntent();
        String token = customerJwt("points-low@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        ResponseEntity<String> created = createOrder(token, idem, 3000);
        assertThat(created.getStatusCode().value()).isEqualTo(422);
        assertThat(created.getBody()).contains("điểm");

        // Compensation đã chạy: đơn FAILED (reservation release qua order.failed)
        String orderId = scalar(
            "SELECT id FROM orders WHERE idempotency_key = ?::text", idem);
        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("FAILED"));
        assertThat(scalar("SELECT points_discount FROM orders WHERE id = ?", orderId))
            .isEqualTo("0");
    }
}
