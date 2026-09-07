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

import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT GHN shipping (SF-14, D22 — pack IT item 3 "GHN mock (WireMock) fee
 * methods"): methods/fee theo district GHN, order dùng method ghn: → phí
 * thật thay flat, ship → vận đơn GHN (tracking_code = order_code), tracking
 * endpoint → detail GHN map status. Không token → fallback flat (degraded).
 */
class GhnShippingTest extends AbstractSagaTest {

    /** GHN double — riêng trong class (parent chỉ có STRIPE + EXTERNAL). */
    static final WireMockServer GHN = new WireMockServer(options().dynamicPort());

    @BeforeAll
    static void startGhn() {
        GHN.start();
        stubGhnHappy();
    }

    @AfterAll
    static void stopGhn() {
        GHN.stop();
    }

    @DynamicPropertySource
    static void ghnProps(DynamicPropertyRegistry registry) {
        registry.add("ordering.ghn.api-url", GHN::baseUrl);
        registry.add("ordering.ghn.token", () -> "it-ghn-token");
        registry.add("ordering.ghn.shop-id", () -> "123456");
        registry.add("ordering.ghn.from-district-id", () -> "1454");
    }

    private static void stubGhnHappy() {
        GHN.stubFor(post(urlEqualTo("/v2/shipping-order/available-services")).willReturn(okJson(
            "{\"code\":200,\"message\":\"Success\",\"data\":["
                + "{\"service_id\":53377,\"short_name\":\"Chuyển phát nhanh\","
                + "\"service_type_id\":2},"
                + "{\"service_id\":53371,\"short_name\":\"Tiết kiệm\",\"service_type_id\":5}]}")));
        GHN.stubFor(post(urlEqualTo("/v2/shipping-order/fee")).willReturn(okJson(
            "{\"code\":200,\"message\":\"Success\",\"data\":{\"total\":45000,\"service_id\":0}}")));
        GHN.stubFor(post(urlEqualTo("/v2/shipping-order/creates")).willReturn(okJson(
            "{\"code\":200,\"message\":\"Success\",\"data\":"
                + "{\"order_code\":\"GHNIT000111\",\"sort_code\":\"SA1-P1-XX\",\"trans_type\":\"truck\"}}")));
        GHN.stubFor(post(urlEqualTo("/v2/shipping-order/detail")).willReturn(okJson(
            "{\"code\":200,\"message\":\"Success\",\"data\":{\"order_code\":\"GHNIT000111\","
                + "\"status\":\"transporting\",\"log\":["
                + "{\"at\":\"2026-09-07T01:00:00Z\",\"description\":\"Đã lấy hàng\"},"
                + "{\"at\":\"2026-09-07T03:30:00Z\",\"description\":\"Đang trung chuyển\"}]}}")));
    }

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    com.fasterxml.jackson.databind.ObjectMapper om;

    @BeforeEach
    void resetStock() {
        seedStock(VARIANT_A, STOCK_A);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ResponseEntity<String> http(String method, String path, String token, String json) {
        return http(method, path, token, json, null);
    }

    private ResponseEntity<String> http(String method, String path, String token, String json,
                                        String idemKey) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            headers.setBearerAuth(token);
        }
        if (idemKey != null) {
            headers.set("Idempotency-Key", idemKey);
        }
        return rest.exchange(path, HttpMethod.valueOf(method),
            new HttpEntity<>(json, headers), String.class);
    }

    private String scalar(String sql, Object... args) {
        return jdbc.queryForObject(sql, String.class, uuidArgs(args));
    }

    private void untilAsserted(org.awaitility.core.ThrowingRunnable assertion) {
        Awaitility.await().atMost(Duration.ofSeconds(20))
            .pollInterval(Duration.ofMillis(200))
            .untilAsserted(assertion);
    }

    // ── 1. Methods theo district GHN: 2 services + phí thật; text → flat ────

    @Test
    void shippingMethods_ghnDistrict_returnsGhnServices_textDistrict_fallsBackFlat() throws Exception {
        String token = customerJwt("ghn-methods@ecommerce.local");

        // district = mã GHN (số) → methods từ WireMock, fee 45.000 (không 20.000 flat)
        ResponseEntity<String> ghn = http("GET",
            "/shipping/methods?province=TP. Hồ Chí Minh&district=201", token, null);
        assertThat(ghn.getStatusCode().value()).isEqualTo(200);
        JsonNode list = om.readTree(ghn.getBody());
        assertThat(list.size()).isEqualTo(2);
        assertThat(list.get(0).path("id").asText()).isEqualTo("ghn:53377");
        assertThat(list.get(0).path("fee").asLong()).isEqualTo(45_000);
        assertThat(list.get(1).path("name").asText()).contains("Tiết kiệm");

        // district là text thường (address form) → fallback flat-fee cùng shape
        ResponseEntity<String> flat = http("GET",
            "/shipping/methods?province=Hà Nội&district=Quận 1", token, null);
        JsonNode flatList = om.readTree(flat.getBody());
        assertThat(flatList.get(0).path("id").asText()).isEqualTo("standard");
        assertThat(flatList.get(0).path("fee").asLong()).isEqualTo(20_000);
    }

    // ── 2. Order method ghn: → phí thật + tracking sau ship + detail GHN ────

    @Test
    void orderWithGhnMethod_realFee_trackingCodeFromGhn() throws Exception {
        STRIPE.stubFor(post(urlEqualTo("/v1/payment_intents")).willReturn(okJson(
            ("{\"id\":\"pi_%s\",\"object\":\"payment_intent\",\"amount\":1,\"currency\":\"vnd\","
                + "\"status\":\"requires_payment_method\",\"client_secret\":\"cs_test_it\",\"livemode\":false}")
                .formatted(UUID.randomUUID().toString().replace("-", "").substring(0, 12)))));
        String token = customerJwt("ghn-order@ecommerce.local");
        String idem = UUID.randomUUID().toString();
        String body = """
            {"items":[{"productId":"%s","variantId":"%s","qty":2}],
             "paymentMethod":"stripe","shippingMethod":"ghn:53377",
             "address":{"fullName":"Nguyễn Văn GHN","phone":"0901234567","line1":"45 Lê Lợi",
               "ward":"Bến Nghé","district":"201","city":"TP. Hồ Chí Minh"}}
            """.formatted(PRODUCT_A, VARIANT_A);
        ResponseEntity<String> created = http("POST", "/orders", token, body, idem);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        JsonNode order = om.readTree(created.getBody()).path("order");
        // 2×150.000 + ship GHN 45.000 (KHÔNG phải 20.000 flat)
        assertThat(order.path("shippingFee").asLong()).isEqualTo(45_000);
        assertThat(order.path("total").asLong()).isEqualTo(345_000);
        String orderId = order.path("id").asText();

        // Pay → CONFIRMED → admin ship → GHN creates → tracking_code
        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);
        rest.exchange("http://localhost:" + paymentPort + "/payment/webhook", HttpMethod.POST,
            signedWebhook(webhookEvent("payment_intent.succeeded", pi, 345_000)), String.class);
        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CONFIRMED"));
        ResponseEntity<String> shipped = http("POST", "/admin/orders/" + orderId + "/ship",
            adminJwt(), null);
        assertThat(shipped.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(shipped.getBody()).path("trackingCode").asText()).isEqualTo("GHNIT000111");

        // Tracking endpoint — carrier GHN + status map transporting → in_transit + events
        ResponseEntity<String> tracking = http("GET", "/me/orders/" + orderId + "/tracking",
            token, null);
        assertThat(tracking.getStatusCode().value()).isEqualTo(200);
        JsonNode tr = om.readTree(tracking.getBody());
        assertThat(tr.path("trackingCode").asText()).isEqualTo("GHNIT000111");
        assertThat(tr.path("carrier").asText()).isEqualTo("GHN");
        assertThat(tr.path("status").asText()).isEqualTo("in_transit");
        assertThat(tr.path("events").size()).isEqualTo(2);
        assertThat(tr.path("events").get(0).path("description").asText()).isEqualTo("Đã lấy hàng");

        // Deliver → tracking vẫn GHN
        http("POST", "/admin/orders/" + orderId + "/deliver", adminJwt(), null);
        ResponseEntity<String> after = http("GET", "/me/orders/" + orderId + "/tracking", token, null);
        assertThat(om.readTree(after.getBody()).path("carrier").asText()).isEqualTo("GHN");
    }
}
