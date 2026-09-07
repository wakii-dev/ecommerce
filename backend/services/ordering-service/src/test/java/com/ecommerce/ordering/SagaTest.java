package com.ecommerce.ordering;

import com.ecommerce.inventory.service.InventorySweeper;
import com.ecommerce.ordering.service.OrderTtlSweeper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
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

import java.nio.file.Path;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Saga fail-injection IT (pack item 9 + compensation edges §3.3) — MỌI case
 * đi qua stack thật: ordering (context SUT) + inventory + payment (context
 * thật) + Rabbit thật. inventory.released → CANCELLED, late-payment refund,
 * coupon nguyên tử, idempotency replay, schema fat payload.
 */
class SagaTest extends AbstractSagaTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;   // datasource ordering (db_ordering)

    @Autowired
    ObjectMapper om;

    @Autowired
    OrderTtlSweeper ttlSweeper;

    @BeforeEach
    void resetStock() {
        seedStock(VARIANT_A, STOCK_A);
        seedStock(VARIANT_B, STOCK_B);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** Body JSON POST /orders — couponCode null khi không có. */
    private String body(String couponCode, String variantA, int qtyA, String variantB, Integer qtyB) {
        StringBuilder items = new StringBuilder();
        if (variantA != null) {
            items.append("{\"productId\":\"").append(PRODUCT_A).append("\",\"variantId\":\"").append(variantA)
                .append("\",\"qty\":").append(qtyA).append("}");
        }
        if (variantB != null) {
            if (items.length() > 0) {
                items.append(',');
            }
            items.append("{\"productId\":\"").append(PRODUCT_B).append("\",\"variantId\":\"").append(variantB)
                .append("\",\"qty\":").append(qtyB).append("}");
        }
        return """
            {"items":[%s],"couponCode":%s,"paymentMethod":"stripe","shippingMethod":"standard",
             "address":{"fullName":"Nguyễn Văn Test","phone":"0901234567","line1":"45 Lê Lợi",
               "ward":"Bến Nghé","district":"Quận 1","city":"TP. Hồ Chí Minh"}}
            """.formatted(items, couponCode == null ? "null" : "\"" + couponCode + "\"");
    }

    private ResponseEntity<String> httpPost(String path, String token, String idemKey, String json) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        if (idemKey != null) {
            headers.set("Idempotency-Key", idemKey);
        }
        return rest.exchange(path, HttpMethod.POST, new HttpEntity<>(json, headers), String.class);
    }

    private ResponseEntity<String> createOrder(String token, String idemKey, String couponCode,
                                               String variantA, int qtyA, String variantB, Integer qtyB) {
        return httpPost("/orders", token, idemKey, body(couponCode, variantA, qtyA, variantB, qtyB));
    }

    private void untilAsserted(org.awaitility.core.ThrowingRunnable assertion) {
        Awaitility.await().atMost(Duration.ofSeconds(20))
            .pollInterval(Duration.ofMillis(200))
            .untilAsserted(assertion);
    }

    private String scalar(String sql, Object... args) {
        return jdbc.queryForObject(sql, String.class, uuidArgs(args));
    }

    private Integer intScalar(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, uuidArgs(args));
    }

    /** Query DB INVENTORY (jdbc autowire của test trỏ db_ordering). */
    private String inventoryScalar(String sql) {
        try (java.sql.Connection conn = java.sql.DriverManager.getConnection(jdbcUrl("db_inventory"), "postgres", "postgres");
             java.sql.Statement st = conn.createStatement();
             java.sql.ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void seedCoupon(String code, String type, long value, Integer limit) {
        execOrdering("""
            INSERT INTO coupons (code, type, value, starts_at, usage_limit, active, description)
            VALUES ('%s', '%s', %d, now(), %s, TRUE, 'IT coupon')
            ON CONFLICT (code) DO UPDATE SET usage_limit = EXCLUDED.usage_limit, used_count = 0, active = TRUE
            """.formatted(code, type, value, limit == null ? "NULL" : limit));
    }

    private void stubStripeIntent() {
        STRIPE.stubFor(post(urlEqualTo("/v1/payment_intents")).willReturn(okJson(
            ("{\"id\":\"pi_%s\",\"object\":\"payment_intent\",\"amount\":1,\"currency\":\"vnd\","
                + "\"status\":\"requires_payment_method\",\"client_secret\":\"cs_test_it\",\"livemode\":false}")
                .formatted(UUID.randomUUID().toString().replace("-", "").substring(0, 12)))));
    }

    /** Fire signed webhook vào payment-service THẬT → payment publish event qua outbox+Rabbit. */
    private void fireWebhook(String type, String pi, long amount) {
        String event = webhookEvent(type, pi, amount);
        ResponseEntity<String> response = rest.exchange(
            "http://localhost:" + paymentPort + "/payment/webhook",
            HttpMethod.POST,
            signedWebhook(event),
            String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
    }

    /** GET availability API của inventory thật — khớp pack "kiểm availability API hồi phục". */
    private int availability(String variantId) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(customerJwt("probe@ecommerce.local"));
        ResponseEntity<String> response = rest.exchange(
            "http://localhost:" + inventoryPort + "/inventory/availability?variantIds=" + variantId,
            HttpMethod.GET, new HttpEntity<>(headers), String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return om.readTree(response.getBody()).get(0).path("available").asInt();
    }

    /** Validate envelope với SCHEMA FROZEN trong contracts/events/ (single source of truth). */
    private Set<ValidationMessage> validateAgainstFrozenSchema(String schemaFile, JsonNode envelope) throws Exception {
        JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
        JsonSchema schema = factory.getSchema(
            Path.of("..", "..", "..", "contracts", "events", schemaFile).toUri());
        return schema.validate(envelope);
    }

    // ── 1. Happy path (§3.3 golden): PENDING → PAID → CONFIRMED ─────────────

    @Test
    void happyPath_pendingToPaidToConfirmed_fatPayloadValidatesFrozenSchema() throws Exception {
        stubStripeIntent();
        String token = customerJwt("happy@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        ResponseEntity<String> created = createOrder(token, idem, "WELCOME10", VARIANT_A, 2, VARIANT_B, 1);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        JsonNode order = om.readTree(created.getBody()).path("order");
        assertThat(order.path("status").asText()).isEqualTo("PENDING");
        // Re-price từ catalog stub: 2×150.000 + (499.000+30.000 priceDelta) = 829.000
        assertThat(order.path("subtotal").asLong()).isEqualTo(829_000);
        // WELCOME10 10% floor(82.900) + ship 20.000
        assertThat(order.path("discount").asLong()).isEqualTo(82_900);
        assertThat(order.path("total").asLong()).isEqualTo(766_100);
        assertThat(order.path("timeline").get(0).path("status").asText()).isEqualTo("PENDING");
        assertThat(om.readTree(created.getBody()).path("clientSecret").asText()).isEqualTo("cs_test_it");
        String orderId = order.path("id").asText();

        // Saga state + coupon RESERVED + stock giữ chỗ (trừ sẵn)
        assertThat(scalar("SELECT step FROM saga_state WHERE order_id = ?", orderId)).isEqualTo("DONE");
        assertThat(scalar("SELECT status FROM coupon_reservations WHERE order_id = ?", orderId)).isEqualTo("RESERVED");
        assertThat(scalar("SELECT used_count FROM coupons WHERE code = 'WELCOME10'")).isEqualTo("1");

        // Webhook THẬT (signed) vào payment-service → payment.succeeded → Rabbit
        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);
        fireWebhook("payment_intent.succeeded", pi, 766_100);

        // PAID → order.paid → inventory commit (order.paid consumer thật) → CONFIRMED
        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CONFIRMED"));
        untilAsserted(() -> assertThat(
            inventoryScalar("SELECT status FROM reservations WHERE order_id = '" + orderId
                + "' ORDER BY created_at DESC LIMIT 1")).isEqualTo("COMMITTED"));

        // Events + coupon FINALIZED
        assertThat(intScalar("SELECT count(*) FROM outbox WHERE event_type = 'order.paid'"))
            .isGreaterThanOrEqualTo(1);
        String confirmedEnvelope = scalar(
            "SELECT payload::text FROM outbox WHERE event_type = 'order.confirmed' ORDER BY created_at DESC LIMIT 1");
        JsonNode envelope = om.readTree(confirmedEnvelope);
        Set<ValidationMessage> errors = validateAgainstFrozenSchema("order.confirmed.schema.json", envelope);
        assertThat(errors).as("order.confirmed validate schema frozen §6.1: %s", errors).isEmpty();
        JsonNode payload = envelope.path("payload");
        assertThat(payload.path("orderId").asText()).isEqualTo(orderId);
        assertThat(payload.path("email").asText()).isEqualTo("happy@ecommerce.local");
        assertThat(payload.path("items").size()).isEqualTo(2);
        assertThat(payload.path("subtotal").asLong()).isEqualTo(829_000);
        assertThat(payload.path("discount").asLong()).isEqualTo(82_900);
        assertThat(payload.path("shippingFee").asLong()).isEqualTo(20_000);
        assertThat(payload.path("total").asLong()).isEqualTo(766_100);
        assertThat(payload.path("couponCode").asText()).isEqualTo("WELCOME10");
        assertThat(payload.path("affiliateCode").isNull()).isTrue();
        assertThat(scalar("SELECT status FROM coupon_reservations WHERE order_id = ?", orderId))
            .isEqualTo("FINALIZED");
    }

    // ── 2. Compensation edge: payment declined → FAILED + release đủ ────────

    @Test
    void declinedPayment_failsOrder_releasesStockAndCoupon() throws Exception {
        stubStripeIntent();
        seedCoupon("DEC50", "FIXED", 50_000, 5);
        String token = customerJwt("declined@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        ResponseEntity<String> created = createOrder(token, idem, "DEC50", VARIANT_A, 1, null, null);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String orderId = om.readTree(created.getBody()).path("order").path("id").asText();
        untilAsserted(() -> assertThat(
            inventoryScalar("SELECT status FROM reservations WHERE order_id = '" + orderId + "'"))
            .isEqualTo("RESERVED"));

        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);
        fireWebhook("payment_intent.payment_failed", pi, 130_000);

        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("FAILED"));
        // Stock hồi phục — qua availability API (pack: "kiểm availability API hồi phục")
        untilAsserted(() -> assertThat(availability(VARIANT_A)).isEqualTo(STOCK_A));
        // Coupon không tăng vĩnh viễn
        assertThat(scalar("SELECT used_count FROM coupons WHERE code = 'DEC50'")).isEqualTo("0");
        assertThat(scalar("SELECT status FROM coupon_reservations WHERE order_id = ?", orderId))
            .isEqualTo("RELEASED");
        // order.failed stage PAYMENT đúng schema
        String failedEnvelope = scalar(
            "SELECT payload::text FROM outbox WHERE event_type='order.failed' ORDER BY created_at DESC LIMIT 1");
        JsonNode payload = om.readTree(failedEnvelope).path("payload");
        assertThat(payload.path("stage").asText()).isEqualTo("PAYMENT");
        assertThat(payload.path("orderId").asText()).isEqualTo(orderId);
    }

    // ── 3. Compensation edge: reserve fail → 409 insufficient[] + FAILED ────

    @Test
    void insufficientStock_returns409WithInsufficientList_orderFails() throws Exception {
        stubStripeIntent();
        seedCoupon("INS50", "FIXED", 50_000, 5);
        String token = customerJwt("insufficient@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        ResponseEntity<String> created = createOrder(token, idem, "INS50", VARIANT_A, 99_999, null, null);
        assertThat(created.getStatusCode().value()).isEqualTo(409);
        JsonNode problem = om.readTree(created.getBody());
        JsonNode insufficient = problem.path("insufficient");
        assertThat(insufficient.isArray()).isTrue();
        assertThat(insufficient.get(0).path("variantId").asText()).isEqualTo(VARIANT_A);
        assertThat(insufficient.get(0).path("requested").asLong()).isEqualTo(99_999);
        assertThat(insufficient.get(0).path("available").asLong()).isEqualTo(STOCK_A);

        // idempotency_key VARCHAR — ép ?::text để uuidArgs không bind UUID nhầm cột
        String orderId = scalar("SELECT id FROM orders WHERE idempotency_key = ?::text", idem);
        assertThat(scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("FAILED");
        // Không rò rỉ reservation + không trừ stock + coupon trả lại
        assertThat(inventoryScalar(
            "SELECT count(*) FROM reservations WHERE order_id = '" + orderId + "'")).isEqualTo("0");
        assertThat(scalar("SELECT used_count FROM coupons WHERE code = 'INS50'")).isEqualTo("0");
        assertThat(scalar("SELECT status FROM coupon_reservations WHERE order_id = ?", orderId))
            .isEqualTo("RELEASED");
        assertThat(availability(VARIANT_A)).isEqualTo(STOCK_A);
    }

    // ── 4. Coupon nguyên tử: limit 1, 2 concurrent → đúng 1 thắng (§6.1.3) ──

    @Test
    void couponLimitOne_twoConcurrentOrders_exactlyOneWins() throws Exception {
        stubStripeIntent();
        seedCoupon("LIMIT1", "PERCENT", 10, 1);
        String token = customerJwt("concurrent@ecommerce.local");

        AtomicReference<Integer> first = new AtomicReference<>();
        AtomicReference<Integer> second = new AtomicReference<>();
        CountDownLatch start = new CountDownLatch(1);
        // thread 2 dùng SLOT variantB (truyền VARIANT_B vào slot variantA → item
        // = product A + variant B → 422 sai nghĩa, che mất kịch bản coupon limit)
        Thread t1 = new Thread(() -> first.set(tryCreate(token, start, "LIMIT1", VARIANT_A, true)));
        Thread t2 = new Thread(() -> second.set(tryCreate(token, start, "LIMIT1", VARIANT_B, false)));
        t1.start();
        t2.start();
        start.countDown();
        t1.join(30_000);
        t2.join(30_000);

        assertThat(Set.of(first.get(), second.get()))
            .as("đúng 1 thắng 201, thua còn lại 422 — không bao giờ cả hai thắng")
            .containsExactlyInAnyOrder(201, 422);
        assertThat(scalar("SELECT used_count FROM coupons WHERE code = 'LIMIT1'")).isEqualTo("1");
    }

    private Integer tryCreate(String token, CountDownLatch start, String coupon, String variant, boolean slotA) {
        try {
            start.await();
            ResponseEntity<String> response = slotA
                ? createOrder(token, UUID.randomUUID().toString(), coupon, variant, 1, null, null)
                : createOrder(token, UUID.randomUUID().toString(), coupon, null, 0, variant, 1);
            return response.getStatusCode().value();
        } catch (Exception e) {
            return -1;
        }
    }

    // ── 5. Idempotency replay (contract POST /orders) ────────────────────────

    @Test
    void idempotencyReplay_sameOrder_409OnDifferentPayload() throws Exception {
        stubStripeIntent();
        String token = customerJwt("idem@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        ResponseEntity<String> first = createOrder(token, idem, null, VARIANT_A, 1, null, null);
        assertThat(first.getStatusCode().value()).isEqualTo(201);
        String orderId = om.readTree(first.getBody()).path("order").path("id").asText();
        String clientSecret = om.readTree(first.getBody()).path("clientSecret").asText();

        // Replay CÙNG payload + key → cùng order, cùng clientSecret (không double-charge)
        ResponseEntity<String> replay = createOrder(token, idem, null, VARIANT_A, 1, null, null);
        assertThat(replay.getStatusCode().value()).isEqualTo(201);
        assertThat(om.readTree(replay.getBody()).path("order").path("id").asText()).isEqualTo(orderId);
        assertThat(om.readTree(replay.getBody()).path("clientSecret").asText()).isEqualTo(clientSecret);
        assertThat(intScalar("SELECT count(*) FROM orders WHERE idempotency_key = ?::text", idem)).isEqualTo(1);

        // Cùng key KHÁC payload → 409, KHÔNG có insufficient[]
        ResponseEntity<String> conflict = httpPost("/orders", token, idem, body(null, VARIANT_B, 5, null, null));
        assertThat(conflict.getStatusCode().value()).isEqualTo(409);
        assertThat(om.readTree(conflict.getBody()).has("insufficient")).isFalse();
    }

    // ── 6. Compensation edge: TTL inventory → CANCELLED + released ──────────

    @Test
    void inventoryTtlRelease_cancelsPendingOrderAndReleasesCoupon() throws Exception {
        stubStripeIntent();
        seedCoupon("TTL10", "PERCENT", 10, 10);
        String token = customerJwt("ttl@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        ResponseEntity<String> created = createOrder(token, idem, "TTL10", VARIANT_A, 3, null, null);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String orderId = om.readTree(created.getBody()).path("order").path("id").asText();

        // Reservation hết hạn + InventorySweeper (context inventory THẬT) chạy
        execInventory("UPDATE reservations SET expires_at = now() - interval '1 minute' WHERE order_id = '" + orderId + "'");
        inventoryCtx.getBean(InventorySweeper.class).releaseExpired();

        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CANCELLED"));
        assertThat(scalar("SELECT used_count FROM coupons WHERE code = 'TTL10'")).isEqualTo("0");
        assertThat(scalar("SELECT status FROM coupon_reservations WHERE order_id = ?", orderId))
            .isEqualTo("RELEASED");
        untilAsserted(() -> assertThat(availability(VARIANT_A)).isEqualTo(STOCK_A));
        String cancelled = scalar(
            "SELECT payload::text FROM outbox WHERE event_type='order.cancelled' ORDER BY created_at DESC LIMIT 1");
        JsonNode payload = om.readTree(cancelled).path("payload");
        assertThat(payload.path("reason").asText()).isEqualTo("ttl_expired");
        assertThat(payload.path("cancelledBy").asText()).isEqualTo("system");
    }

    // ── 7. Safety net: ordering sweeper PENDING quá hạn (35' → 2h backdate) ──

    @Test
    void ttlSweeper_cancelsStalePendingOrder() throws Exception {
        stubStripeIntent();
        seedCoupon("SAFE20", "PERCENT", 20, 10);
        String token = customerJwt("sweeper@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        // variant B nằm ở SLOT THỨ 2 (body định vị: variantA trước, variantB sau)
        ResponseEntity<String> created = createOrder(token, idem, "SAFE20", null, 0, VARIANT_B, 1);
        assertThat(created.getStatusCode().value())
            .as("create phải 201 — body: %s", created.getBody()).isEqualTo(201);
        String orderId = om.readTree(created.getBody()).path("order").path("id").asText();

        execOrdering("UPDATE orders SET created_at = now() - interval '2 hours' WHERE id = '" + orderId + "'");
        ttlSweeper.cancelStalePending();

        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CANCELLED"));
        assertThat(scalar("SELECT used_count FROM coupons WHERE code = 'SAFE20'")).isEqualTo("0");
        untilAsserted(() -> assertThat(availability(VARIANT_B)).isEqualTo(STOCK_B));
    }

    // ── 8. Compensation edge: LATE payment sau terminal → refund (§3.3) ─────

    @Test
    void latePaymentAfterTerminal_triggersRefund_keepsTerminalStatus() throws Exception {
        stubStripeIntent();
        String token = customerJwt("late@ecommerce.local");
        String idem = UUID.randomUUID().toString();

        ResponseEntity<String> created = createOrder(token, idem, null, VARIANT_A, 1, null, null);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String orderId = om.readTree(created.getBody()).path("order").path("id").asText();
        String pi = scalar("SELECT stripe_intent_id FROM orders WHERE id = ?", orderId);

        // TTL hết → CANCELLED trước khi tiền vào (user quên tab Stripe)
        execOrdering("UPDATE orders SET created_at = now() - interval '2 hours' WHERE id = '" + orderId + "'");
        ttlSweeper.cancelStalePending();
        untilAsserted(() -> assertThat(
            scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CANCELLED"));

        // Refund trên Stripe double — ordering phải gọi với đúng payment_intent
        STRIPE.stubFor(post(urlEqualTo("/v1/refunds"))
            .withRequestBody(containing(pi))
            .willReturn(okJson("{\"id\":\"re_late\",\"object\":\"refund\",\"amount\":130000,"
                + "\"status\":\"succeeded\",\"payment_intent\":\"" + pi + "\",\"livemode\":false}")));

        // Tiền vào SAU khi order đã terminal
        fireWebhook("payment_intent.succeeded", pi, 130_000);

        untilAsserted(() -> STRIPE.verify(com.github.tomakehurst.wiremock.client.WireMock
            .postRequestedFor(urlEqualTo("/v1/refunds")).withRequestBody(containing(pi))));
        // Status giữ terminal (refund + log, KHÔNG đổi state — pin §3.3)
        assertThat(scalar("SELECT status FROM orders WHERE id = ?", orderId)).isEqualTo("CANCELLED");
    }
}
