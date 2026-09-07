package com.ecommerce.ordering;

import com.fasterxml.jackson.databind.JsonNode;
import org.awaitility.Awaitility;
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

import java.time.Duration;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT RMA lifecycle (SF-14, D22 — pack IT item 1): guards + lifecycle trọn
 * vẹn TRÊN STACK THẬT (AbstractSagaTest — webhook thật, Stripe WireMock):
 *
 * <pre>
 * DELIVERED → POST /me/rma (202 REQUESTED) → admin approve → mark-received
 *   → refund (Stripe refund thật qua payment-service) → REFUNDED + rma.* events
 * Guards: ngoài 7 ngày → 409 · sai trạng thái → 409 · sai chủ đơn → 404 ·
 *   line lạ/qty vượt → 400 · double-refund (2 RMA/đơn) → 409.
 * </pre>
 */
class RmaLifecycleTest extends AbstractSagaTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    com.fasterxml.jackson.databind.ObjectMapper om;

    @BeforeEach
    void resetStock() {
        seedStock(VARIANT_A, STOCK_A);
        seedStock(VARIANT_B, STOCK_B);
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

    /**
     * Tạo đơn stripe → webhook succeeded → CONFIRMED → ship → deliver.
     * Trả {orderId, customerToken} — token DÙNG CHUNG cho các thao tác chủ đơn
     * (customerJwt mồi sub random mỗi lần → token khác = user khác → 404).
     */
    private String[] createDeliveredOrder(String email) throws Exception {
        STRIPE.stubFor(post(urlEqualTo("/v1/payment_intents")).willReturn(okJson(
            ("{\"id\":\"pi_%s\",\"object\":\"payment_intent\",\"amount\":1,\"currency\":\"vnd\","
                + "\"status\":\"requires_payment_method\",\"client_secret\":\"cs_test_it\",\"livemode\":false}")
                .formatted(UUID.randomUUID().toString().replace("-", "").substring(0, 12)))));
        String token = customerJwt(email);
        String body = """
            {"items":[{"productId":"%s","variantId":"%s","qty":2}],
             "paymentMethod":"stripe","shippingMethod":"standard",
             "address":{"fullName":"Nguyễn Văn Test","phone":"0901234567","line1":"45 Lê Lợi",
               "ward":"Bến Nghé","district":"Quận 1","city":"TP. Hồ Chí Minh"}}
            """.formatted(PRODUCT_A, VARIANT_A);
        ResponseEntity<String> created = http("POST", "/orders", token, body,
            UUID.randomUUID().toString());
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String orderId = om.readTree(created.getBody()).path("order").path("id").asText();

        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);
        ResponseEntity<String> webhook = rest.exchange(
            "http://localhost:" + paymentPort + "/payment/webhook", HttpMethod.POST,
            signedWebhook(webhookEvent("payment_intent.succeeded", pi, 300_000)), String.class);
        assertThat(webhook.getStatusCode().value()).isEqualTo(200);
        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CONFIRMED"));

        assertThat(http("POST", "/admin/orders/" + orderId + "/ship", adminJwt(), null)
            .getStatusCode().value()).isEqualTo(200);
        assertThat(http("POST", "/admin/orders/" + orderId + "/deliver", adminJwt(), null)
            .getStatusCode().value()).isEqualTo(200);
        return new String[]{orderId, token};
    }

    private String rmaBody(String orderId, String lineId, int qty) {
        return """
            {"orderId":"%s","lines":[{"lineId":"%s","qty":%d}],
             "reason":"Sai mẫu - muốn trả hàng"}
            """.formatted(orderId, lineId, qty);
    }

    private String firstLineId(String orderId) {
        return scalar("SELECT id FROM order_items WHERE order_id = ? LIMIT 1", orderId);
    }

    private String scalar(String sql, Object... args) {
        return jdbc.queryForObject(sql, String.class, uuidArgs(args));
    }

    private void untilAsserted(org.awaitility.core.ThrowingRunnable assertion) {
        Awaitility.await().atMost(Duration.ofSeconds(20))
            .pollInterval(Duration.ofMillis(200))
            .untilAsserted(assertion);
    }

    // ── 1. Happy lifecycle: REQUESTED → APPROVED → RECEIVED → REFUNDED ─────

    @Test
    void rmaLifecycle_fullFlow_refundViaStripe_eventsPublished() throws Exception {
        String[] co = createDeliveredOrder("rma-happy@ecommerce.local");
        String orderId = co[0];
        String customer = co[1];
        String admin = adminJwt();

        // Customer tạo RMA — 202 REQUESTED (contract)
        ResponseEntity<String> created = http("POST", "/me/rma", customer,
            rmaBody(orderId, firstLineId(orderId), 1));
        assertThat(created.getStatusCode().value()).isEqualTo(202);
        JsonNode rma = om.readTree(created.getBody());
        assertThat(rma.path("status").asText()).isEqualTo("REQUESTED");
        String rmaId = rma.path("id").asText();

        // Admin: approve → mark-received
        assertThat(http("POST", "/admin/rma/" + rmaId + "/approve", admin, null).getBody())
            .contains("\"APPROVED\"");
        assertThat(http("POST", "/admin/rma/" + rmaId + "/mark-received", admin, null).getBody())
            .contains("\"RECEIVED\"");

        // Refund — Stripe double nhận refund với đúng intent
        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);
        STRIPE.stubFor(post(urlEqualTo("/v1/refunds"))
            .withRequestBody(containing(pi))
            .willReturn(okJson("{\"id\":\"re_rma\",\"object\":\"refund\",\"amount\":300000,"
                + "\"status\":\"succeeded\",\"payment_intent\":\"" + pi + "\",\"livemode\":false}")));
        ResponseEntity<String> refunded = http("POST", "/admin/rma/" + rmaId + "/refund", admin, null);
        assertThat(refunded.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(refunded.getBody()).path("status").asText()).isEqualTo("REFUNDED");

        untilAsserted(() -> STRIPE.verify(com.github.tomakehurst.wiremock.client.WireMock
            .postRequestedFor(urlEqualTo("/v1/refunds")).withRequestBody(containing(pi))));
        assertThat(scalar("SELECT refund_amount FROM rma_requests WHERE id = ?", rmaId))
            .isEqualTo("320000"); // full đơn: 2×150.000 + ship 20.000

        // Events rma.* — payload FAT có email (D6, notification không call-back);
        // outbox.payload là ENVELOPE → business payload nằm ở .path("payload")
        String refundedEvent = scalar(
            "SELECT payload::text FROM outbox WHERE event_type = 'rma.refunded' ORDER BY created_at DESC LIMIT 1");
        JsonNode payload = om.readTree(refundedEvent).path("payload");
        assertThat(payload.path("email").asText()).isEqualTo("rma-happy@ecommerce.local");
        assertThat(payload.path("orderId").asText()).isEqualTo(orderId);
        assertThat(payload.path("refundAmount").asLong()).isEqualTo(320_000);
        assertThat(intScalar("SELECT count(*) FROM outbox WHERE event_type = 'rma.requested'"))
            .isGreaterThanOrEqualTo(1);
        assertThat(intScalar("SELECT count(*) FROM outbox WHERE event_type = 'rma.approved'"))
            .isGreaterThanOrEqualTo(1);
    }

    private Integer intScalar(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    // ── 2. Guards: sai trạng thái / sai chủ đơn / line lạ ───────────────────

    @Test
    void rmaGuards_notDelivered_wrongOwner_invalidLine() throws Exception {
        // Đơn chỉ CONFIRMED (chưa DELIVERED) → 409
        STRIPE.stubFor(post(urlEqualTo("/v1/payment_intents")).willReturn(okJson(
            ("{\"id\":\"pi_%s\",\"object\":\"payment_intent\",\"amount\":1,\"currency\":\"vnd\","
                + "\"status\":\"requires_payment_method\",\"client_secret\":\"cs_x\",\"livemode\":false}")
                .formatted(UUID.randomUUID().toString().replace("-", "").substring(0, 12)))));
        String owner = customerJwt("rma-guard@ecommerce.local");
        String body = """
            {"items":[{"productId":"%s","variantId":"%s","qty":1}],
             "paymentMethod":"stripe","shippingMethod":"standard",
             "address":{"fullName":"G","phone":"0901234567","line1":"45 Lê Lợi",
               "ward":"Bến Nghé","district":"Quận 1","city":"TP. Hồ Chí Minh"}}
            """.formatted(PRODUCT_A, VARIANT_A);
        ResponseEntity<String> created = http("POST", "/orders", owner, body,
            UUID.randomUUID().toString());
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String confirmedOrderId = om.readTree(created.getBody()).path("order").path("id").asText();
        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", confirmedOrderId);
        rest.exchange("http://localhost:" + paymentPort + "/payment/webhook", HttpMethod.POST,
            signedWebhook(webhookEvent("payment_intent.succeeded", pi, 150_000)), String.class);
        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", confirmedOrderId)).isEqualTo("CONFIRMED"));

        ResponseEntity<String> tooEarly = http("POST", "/me/rma", owner,
            rmaBody(confirmedOrderId, firstLineId(confirmedOrderId), 1));
        assertThat(tooEarly.getStatusCode().value()).isEqualTo(409);

        // Sai chủ đơn → 404 (không lộ đơn người khác)
        String other = customerJwt("rma-other@ecommerce.local");
        String[] owned = createDeliveredOrder("rma-owner@ecommerce.local");
        String deliveredId = owned[0];
        String ownerToken = owned[1];
        ResponseEntity<String> notOwner = http("POST", "/me/rma", other,
            rmaBody(deliveredId, firstLineId(deliveredId), 1));
        assertThat(notOwner.getStatusCode().value()).isEqualTo(404);

        // lineId lạ → 400
        ResponseEntity<String> badLine = http("POST", "/me/rma", ownerToken,
            rmaBody(deliveredId, UUID.randomUUID().toString(), 1));
        assertThat(badLine.getStatusCode().value()).isEqualTo(400);

        // qty vượt line → 400
        ResponseEntity<String> tooMany = http("POST", "/me/rma", ownerToken,
            rmaBody(deliveredId, firstLineId(deliveredId), 99));
        assertThat(tooMany.getStatusCode().value()).isEqualTo(400);
    }

    // ── 3. Cửa sổ 7 ngày: DELIVERED quá 8 ngày → 409 ────────────────────────

    @Test
    void rmaWindow_after7Days_409() throws Exception {
        String[] co = createDeliveredOrder("rma-window@ecommerce.local");
        String orderId = co[0];
        // Backdate entry DELIVERED trong timeline jsonb lên 8 ngày
        execOrdering("""
            UPDATE orders SET timeline = (
              SELECT jsonb_agg(CASE WHEN elem->>'status' = 'DELIVERED'
                THEN jsonb_set(elem, '{at}', to_jsonb(to_char(now() - interval '8 days',
                     'YYYY-MM-DD"T"HH24:MI:SS"Z"')), TRUE) ELSE elem END)
              FROM jsonb_array_elements(timeline) elem)
            WHERE id = '%s'
            """.formatted(orderId));

        ResponseEntity<String> created = http("POST", "/me/rma", co[1],
            rmaBody(orderId, firstLineId(orderId), 1));
        assertThat(created.getStatusCode().value()).isEqualTo(409);
        assertThat(created.getBody()).contains("7 ngày");
    }

    // ── 4. Double-refund guard: RMA 2 cùng đơn → 409 (D2) ───────────────────

    @Test
    void doubleRefund_secondRmaSameOrder_409() throws Exception {
        String[] co = createDeliveredOrder("rma-double@ecommerce.local");
        String orderId = co[0];
        String customer = co[1];
        String admin = adminJwt();
        String lineId = firstLineId(orderId);

        String rma1 = om.readTree(http("POST", "/me/rma", customer,
            rmaBody(orderId, lineId, 1)).getBody()).path("id").asText();
        http("POST", "/admin/rma/" + rma1 + "/approve", admin, null);
        http("POST", "/admin/rma/" + rma1 + "/mark-received", admin, null);
        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);
        STRIPE.stubFor(post(urlEqualTo("/v1/refunds"))
            .withRequestBody(containing(pi))
            .willReturn(okJson("{\"id\":\"re_d1\",\"object\":\"refund\",\"amount\":320000,"
                + "\"status\":\"succeeded\",\"payment_intent\":\"" + pi + "\",\"livemode\":false}")));
        assertThat(http("POST", "/admin/rma/" + rma1 + "/refund", admin, null)
            .getStatusCode().value()).isEqualTo(200);

        // RMA thứ 2 trên CÙNG đơn — refund phải bị chặn (không trừ 2 lần)
        String rma2 = om.readTree(http("POST", "/me/rma", customer,
            rmaBody(orderId, lineId, 1)).getBody()).path("id").asText();
        http("POST", "/admin/rma/" + rma2 + "/approve", admin, null);
        http("POST", "/admin/rma/" + rma2 + "/mark-received", admin, null);
        ResponseEntity<String> second = http("POST", "/admin/rma/" + rma2 + "/refund", admin, null);
        assertThat(second.getStatusCode().value()).isEqualTo(409);
        assertThat(second.getBody()).contains("hoàn lần 2");
    }

    // ── 5. State machine: skip bước → 409 (RECEIVED → REFUNDED only) ────────

    @Test
    void stateGuards_skipTransition_409() throws Exception {
        String[] co = createDeliveredOrder("rma-state@ecommerce.local");
        String orderId = co[0];
        String customer = co[1];
        String admin = adminJwt();
        String rmaId = om.readTree(http("POST", "/me/rma", customer,
            rmaBody(orderId, firstLineId(orderId), 1)).getBody()).path("id").asText();

        // REQUESTED → REFUNDED trực tiếp (bỏ approve + mark-received) → 409
        ResponseEntity<String> skip = http("POST", "/admin/rma/" + rmaId + "/refund", admin, null);
        assertThat(skip.getStatusCode().value()).isEqualTo(409);
        // REQUESTED → RECEIVED trực tiếp → 409
        ResponseEntity<String> skip2 = http("POST", "/admin/rma/" + rmaId + "/mark-received", admin, null);
        assertThat(skip2.getStatusCode().value()).isEqualTo(409);
    }
}
