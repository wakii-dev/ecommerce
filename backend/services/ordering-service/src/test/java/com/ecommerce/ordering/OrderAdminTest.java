package com.ecommerce.ordering;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
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
import java.time.LocalDate;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Admin + state machine guards §3.6 + stats §6.1.8 + my-orders + invoice D18.
 * Stack thật chung {@link AbstractSagaTest} (context cache — không boot lại).
 */
class OrderAdminTest extends AbstractSagaTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ObjectMapper om;

    /**
     * Seed stock MỖI test (không lệ thuộc SagaTest chạy trước — test-order
     * coupling): các đơn PENDING trong test khác giữ reservation mãi → available
     * giảm dần qua class → seed dư để mọi test tự đủ.
     */
    @BeforeEach
    void seedStockForAdmin() {
        seedStock(VARIANT_A, 200);
        seedStock(VARIANT_B, 100);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private HttpHeaders auth(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        return headers;
    }

    private String body(String variant, int qty) {
        return """
            {"items":[{"productId":"%s","variantId":"%s","qty":%d}],"paymentMethod":"stripe",
             "shippingMethod":"standard",
             "address":{"fullName":"Trần Thị It","phone":"0987654321","line1":"12 Nguyễn Huệ",
               "ward":"Bến Nghé","district":"Quận 1","city":"TP. Hồ Chí Minh"}}
            """.formatted(PRODUCT_A, variant, qty);
    }

    /** Tạo đơn PENDING (không coupon) → trả {orderId, pi, email, token}. */
    private String[] createPending(String email) throws Exception {
        String token = customerJwt(email);
        STRIPE.stubFor(post(urlEqualTo("/v1/payment_intents")).willReturn(okJson(
            ("{\"id\":\"pi_%s\",\"object\":\"payment_intent\",\"amount\":1,\"currency\":\"vnd\","
                + "\"status\":\"requires_payment_method\",\"client_secret\":\"cs_adm\",\"livemode\":false}")
                .formatted(UUID.randomUUID().toString().replace("-", "").substring(0, 12)))));
        ResponseEntity<String> created = rest.exchange("/orders", HttpMethod.POST,
            new HttpEntity<>(body(VARIANT_A, 1), createHeaders(token)), String.class);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String orderId = om.readTree(created.getBody()).path("order").path("id").asText();
        String pi = q("SELECT stripe_intent_id FROM orders WHERE id = ?", String.class, orderId);
        return new String[]{orderId, pi, token};
    }

    /** POST /orders BẮT BUỘC Idempotency-Key (contract) — thiếu → 400/500. */
    private HttpHeaders createHeaders(String token) {
        HttpHeaders headers = auth(token);
        headers.set("Idempotency-Key", UUID.randomUUID().toString());
        return headers;
    }

    /** Webhook succeeded → chờ CONFIRMED (chuỗi Rabbit thật). */
    private void driveToConfirmed(String orderId, String pi) throws Exception {
        String event = webhookEvent("payment_intent.succeeded", pi, 170_000);
        ResponseEntity<String> response = rest.exchange("http://localhost:" + paymentPort + "/payment/webhook",
            HttpMethod.POST, signedWebhook(event), String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        Awaitility.await().atMost(Duration.ofSeconds(20)).pollInterval(Duration.ofMillis(200))
            .untilAsserted(() -> assertThat(q(
                "SELECT status FROM orders WHERE id = ?", String.class, orderId)).isEqualTo("CONFIRMED"));
    }

    private <T> ResponseEntity<T> exchange(String path, String token, HttpMethod method, Class<T> type) {
        return rest.exchange(path, method, new HttpEntity<>(auth(token)), type);
    }

    /** Query 1 cột — bind UUID-shape args qua {@link AbstractSagaTest#uuidArgs} (PG: uuid ≠ varchar). */
    private <T> T q(String sql, Class<T> type, Object... args) {
        return jdbc.queryForObject(sql, type, uuidArgs(args));
    }

    private String pdfText(byte[] pdf) throws Exception {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(document);
        }
    }

    // ── My orders: list + detail + owner isolation (pack item 6) ────────────

    @Test
    void myOrders_detailOwnerIsolation() throws Exception {
        String[] order = createPending("owner-a@ecommerce.local");
        String orderId = order[0];
        String token = order[2];

        ResponseEntity<String> detail = exchange("/me/orders/" + orderId, token, HttpMethod.GET, String.class);
        assertThat(detail.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(detail.getBody()).path("items").size()).isEqualTo(1);
        assertThat(om.readTree(detail.getBody()).path("items").get(0).path("name").asText()).contains("Sản phẩm");

        // User khác → 404 (không leak tồn tại)
        assertThat(exchange("/me/orders/" + orderId, customerJwt("owner-b@ecommerce.local"),
            HttpMethod.GET, String.class).getStatusCode().value()).isEqualTo(404);

        // List có đơn, mới nhất trước, summary không items
        ResponseEntity<String> list = exchange("/me/orders", token, HttpMethod.GET, String.class);
        assertThat(list.getStatusCode().value()).isEqualTo(200);
        JsonNode page = om.readTree(list.getBody());
        assertThat(page.path("total").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(page.path("items").get(0).has("items")).isFalse();
        assertThat(page.path("items").get(0).path("itemsCount").asInt()).isEqualTo(1);
    }

    // ── User cancel PENDING → CANCELLED + release (pack item 6) ─────────────

    @Test
    void userCancelsPendingOrder_releasesReservation() throws Exception {
        // body() hardcode PRODUCT_A — dùng VARIANT_A (không phải VARIANT_B:
        // product A + variant B → 422 sai nghĩa, orderId rỗng → 405 ảo ở cancel)
        seedStock(VARIANT_A, 10);
        String token = customerJwt("canceler@ecommerce.local");
        STRIPE.stubFor(post(urlEqualTo("/v1/payment_intents")).willReturn(okJson(
            ("{\"id\":\"pi_%s\",\"object\":\"payment_intent\",\"amount\":1,\"currency\":\"vnd\","
                + "\"status\":\"requires_payment_method\",\"client_secret\":\"cs_cancel\",\"livemode\":false}")
                .formatted(UUID.randomUUID().toString().replace("-", "").substring(0, 12)))));
        ResponseEntity<String> created = rest.exchange("/orders", HttpMethod.POST,
            new HttpEntity<>(body(VARIANT_A, 2), createHeaders(token)), String.class);
        assertThat(created.getStatusCode().value())
            .as("create phải 201 — body: %s", created.getBody()).isEqualTo(201);
        String orderId = om.readTree(created.getBody()).path("order").path("id").asText();

        ResponseEntity<String> cancelled = exchange("/me/orders/" + orderId + "/cancel", token,
            HttpMethod.POST, String.class);
        assertThat(cancelled.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(cancelled.getBody()).path("status").asText()).isEqualTo("CANCELLED");
        // Cancel lần 2 → 409 (guard §3.6)
        assertThat(exchange("/me/orders/" + orderId + "/cancel", token, HttpMethod.POST, String.class)
            .getStatusCode().value()).isEqualTo(409);
        // Stock hoàn lại qua inventory thật (order.cancelled → release)
        Awaitility.await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            ResponseEntity<String> availability = exchange(
                "http://localhost:" + inventoryPort + "/inventory/availability?variantIds=" + VARIANT_A,
                customerJwt("probe2@ecommerce.local"), HttpMethod.GET, String.class);
            assertThat(om.readTree(availability.getBody()).get(0).path("available").asInt()).isEqualTo(10);
        });
    }

    // ── State machine §3.6: admin ship/deliver + guards ─────────────────────

    @Test
    void adminShipDeliver_withStateMachineGuards() throws Exception {
        String[] order = createPending("shipper@ecommerce.local");
        String orderId = order[0];
        String admin = adminJwt();

        // PENDING → ship: 409 (CONFIRMED mới ship được)
        assertThat(exchange("/admin/orders/" + orderId + "/ship", admin, HttpMethod.POST, String.class)
            .getStatusCode().value()).isEqualTo(409);

        driveToConfirmed(orderId, order[1]);

        ResponseEntity<String> shipped = exchange("/admin/orders/" + orderId + "/ship", admin,
            HttpMethod.POST, String.class);
        assertThat(shipped.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(shipped.getBody()).path("status").asText()).isEqualTo("SHIPPED");
        assertThat(om.readTree(shipped.getBody()).path("trackingCode").asText()).startsWith("TRK-");
        // Ship lần 2 → 409
        assertThat(exchange("/admin/orders/" + orderId + "/ship", admin, HttpMethod.POST, String.class)
            .getStatusCode().value()).isEqualTo(409);

        ResponseEntity<String> delivered = exchange("/admin/orders/" + orderId + "/deliver", admin,
            HttpMethod.POST, String.class);
        assertThat(delivered.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(delivered.getBody()).path("status").asText()).isEqualTo("DELIVERED");
        // DELIVERED terminal — cancel → 409
        assertThat(exchange("/admin/orders/" + orderId + "/cancel", admin, HttpMethod.POST, String.class)
            .getStatusCode().value()).isEqualTo(409);
    }

    // ── Admin cancel sau PAID → refund tự động (contract + §3.3 edge 4) ─────

    @Test
    void adminCancelAfterPaid_refundsAutomatically() throws Exception {
        String[] order = createPending("admincancel@ecommerce.local");
        String orderId = order[0];
        String pi = order[1];
        String admin = adminJwt();
        driveToConfirmed(orderId, pi);

        STRIPE.stubFor(post(urlEqualTo("/v1/refunds"))
            .withRequestBody(containing(pi))
            .willReturn(okJson("{\"id\":\"re_adm\",\"object\":\"refund\",\"amount\":170000,"
                + "\"status\":\"succeeded\",\"payment_intent\":\"" + pi + "\",\"livemode\":false}")));

        ResponseEntity<String> cancelled = exchange("/admin/orders/" + orderId + "/cancel", admin,
            HttpMethod.POST, String.class);
        assertThat(cancelled.getStatusCode().value()).isEqualTo(200);
        assertThat(om.readTree(cancelled.getBody()).path("status").asText()).isEqualTo("CANCELLED");
        // Refund đã gọi đúng pi
        Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
            STRIPE.verify(com.github.tomakehurst.wiremock.client.WireMock
                .postRequestedFor(urlEqualTo("/v1/refunds")).withRequestBody(containing(pi))));
        // outbox order.cancelled refunded=true — outbox.payload = EventEnvelope
        // BỌC business payload (OutboxWriter) → orderId/refunded nằm ở ->'payload'
        String payload = jdbc.queryForObject(
            "SELECT payload->'payload' FROM outbox "
                + "WHERE event_type='order.cancelled' AND payload->'payload'->>'orderId' = ?",
            String.class, orderId);
        assertThat(om.readTree(payload).path("refunded").asBoolean()).isTrue();
    }

    // ── RBAC 2 lớp: customer chạm admin → 403 (service-level @PreAuthorize) ─

    @Test
    void customerIsForbiddenOnAdminEndpoints() {
        assertThat(exchange("/admin/orders", customerJwt("rbac@ecommerce.local"), HttpMethod.GET, String.class)
            .getStatusCode().value()).isEqualTo(403);
    }

    // ── Admin list + filter (pack item 5) ────────────────────────────────────

    @Test
    void adminListOrders_filterStatusAndPagination() throws Exception {
        String[] order = createPending("listfilter@ecommerce.local");
        String admin = adminJwt();

        ResponseEntity<String> page = exchange(
            "/admin/orders?status=PENDING&page=1&size=5", admin, HttpMethod.GET, String.class);
        assertThat(page.getStatusCode().value()).isEqualTo(200);
        JsonNode body = om.readTree(page.getBody());
        assertThat(body.path("page").asInt()).isEqualTo(1);
        body.path("items").forEach(item -> assertThat(item.path("status").asText()).isEqualTo("PENDING"));

        // q theo email
        ResponseEntity<String> byQ = exchange(
            "/admin/orders?q=listfilter@ecommerce.local", admin, HttpMethod.GET, String.class);
        JsonNode qBody = om.readTree(byQ.getBody());
        assertThat(qBody.path("total").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(qBody.path("items").get(0).path("id").asText()).isEqualTo(order[0]);
    }

    // ── Admin stats (§6.1.8 — aggregate đúng với dữ liệu test) ──────────────

    @Test
    void adminStats_aggregateCorrectly() throws Exception {
        String[] o1 = createPending("stats@ecommerce.local");
        driveToConfirmed(o1[0], o1[1]);

        String admin = adminJwt();
        long total = q("SELECT total FROM orders WHERE id = ?", Long.class, o1[0]);
        long beforeRevenue = jdbc.queryForObject("""
            SELECT COALESCE(SUM(total), 0) FROM orders
            WHERE status IN ('PAID','CONFIRMED','SHIPPED','DELIVERED')""", Long.class);

        ResponseEntity<String> summary = exchange("/admin/stats/orders-summary", admin, HttpMethod.GET, String.class);
        JsonNode summaryBody = om.readTree(summary.getBody());
        assertThat(summaryBody.path("totalRevenue").asLong()).isEqualTo(beforeRevenue);
        assertThat(summaryBody.path("confirmed").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(summaryBody.path("todayOrders").asLong()).isGreaterThanOrEqualTo(1);

        // Ngày bucket theo UTC — endpoint mở window from/to qua ZoneOffset.UTC
        // (AdminOrderController). created_at::date THÔNG thường cast theo session
        // TimeZone (JVM UTC+7) → lệch 1 ngày lúc nửa đêm → mảng rỗng (flaky).
        String today = jdbc.queryForObject(
            "SELECT (created_at AT TIME ZONE 'UTC')::date::text FROM orders WHERE id = ?", String.class,
            java.util.UUID.fromString(o1[0]));
        ResponseEntity<String> revenue = exchange(
            "/admin/stats/revenue-by-day?from=" + today + "&to=" + today, admin, HttpMethod.GET, String.class);
        JsonNode revenueBody = om.readTree(revenue.getBody());
        assertThat(revenueBody.size()).isGreaterThanOrEqualTo(1);
        long dayRevenue = 0;
        long dayOrders = 0;
        for (JsonNode entry : revenueBody) {
            dayRevenue += entry.path("revenue").asLong();
            dayOrders += entry.path("orders").asLong();
        }
        assertThat(dayRevenue).isEqualTo(beforeRevenue);
        assertThat(dayOrders).isGreaterThanOrEqualTo(1);

        ResponseEntity<String> top = exchange(
            "/admin/stats/top-products?limit=10", admin, HttpMethod.GET, String.class);
        JsonNode topBody = om.readTree(top.getBody());
        assertThat(topBody.size()).isGreaterThanOrEqualTo(1);
        assertThat(topBody.get(0).path("qty").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(topBody.get(0).path("name").asText()).isNotBlank();
    }

    // ── Invoice D18: numbering tuần tự + cùng đơn → cùng số + PDF fields ────

    @Test
    void invoice_numbersSequentialSameOrderSameNumber_pdfHasVatBreakdown() throws Exception {
        String[] first = createPending("invoice1@ecommerce.local");
        driveToConfirmed(first[0], first[1]);
        String[] second = createPending("invoice2@ecommerce.local");
        driveToConfirmed(second[0], second[1]);

        ResponseEntity<byte[]> pdf1 = exchange("/me/orders/" + first[0] + "/invoice", first[2],
            HttpMethod.GET, byte[].class);
        ResponseEntity<byte[]> pdf2 = exchange("/me/orders/" + second[0] + "/invoice", second[2],
            HttpMethod.GET, byte[].class);
        assertThat(pdf1.getStatusCode().value()).isEqualTo(200);
        assertThat(pdf2.getStatusCode().value()).isEqualTo(200);
        assertThat(pdf1.getHeaders().getContentType().toString()).isEqualTo("application/pdf");
        assertThat(new String(pdf1.getBody(), java.nio.charset.StandardCharsets.ISO_8859_1)).startsWith("%PDF");

        long number1 = q("SELECT invoice_number FROM orders WHERE id = ?", Long.class, first[0]);
        long number2 = q("SELECT invoice_number FROM orders WHERE id = ?", Long.class, second[0]);
        assertThat(number2).as("số HĐ tăng dần giữa các đơn (D18)").isGreaterThan(number1);

        // Tải LẠI cùng đơn → cùng số (không cấp thêm)
        ResponseEntity<byte[]> pdf1again = exchange("/me/orders/" + first[0] + "/invoice", first[2],
            HttpMethod.GET, byte[].class);
        long number1again = q("SELECT invoice_number FROM orders WHERE id = ?", Long.class, first[0]);
        assertThat(number1again).isEqualTo(number1);
        assertThat(pdf1again.getStatusCode().value()).isEqualTo(200);

        // PDF content: đủ trường hóa đơn VN + VAT breakdown + disclaimer (D18 ACCEPTANCE)
        String text = pdfText(pdf1.getBody());
        assertThat(text).contains("HÓA ĐƠN GIÁ TRỊ GIA TĂNG");
        assertThat(text).contains("Mẫu số: 01/001");
        assertThat(text).contains("Ký hiệu: C26");
        assertThat(text).contains(String.format("Số: %06d", number1));
        assertThat(text).contains("Sản phẩm A");
        assertThat(text).contains("Trần Thị It");
        long expectedVat = Math.round(170_000 * 10.0 / 110.0); // total×rate/(100+rate)
        String vatFormatted = String.format("%,d", expectedVat).replace(',', '.') + "đ";
        assertThat(text).contains("Thuế GTGT 10%");
        assertThat(text).contains(vatFormatted);
        assertThat(text).contains("Bản demo — không phải hóa đơn chữ ký số");

        // Admin tải được hóa đơn cùng đơn (D18)
        ResponseEntity<byte[]> adminPdf = exchange("/admin/orders/" + first[0] + "/invoice", adminJwt(),
            HttpMethod.GET, byte[].class);
        assertThat(adminPdf.getStatusCode().value()).isEqualTo(200);
        assertThat(pdfText(adminPdf.getBody())).contains(String.format("Số: %06d", number1));
    }

    // ── Invoice 409 khi chưa CONFIRMED (contract) ────────────────────────────

    @Test
    void invoice_beforeConfirmed_returns409() throws Exception {
        String[] order = createPending("pendinginv@ecommerce.local");
        ResponseEntity<String> response = exchange("/me/orders/" + order[0] + "/invoice", order[2],
            HttpMethod.GET, String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(409);
    }
}
