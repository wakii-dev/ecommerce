package com.ecommerce.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static com.github.tomakehurst.wiremock.client.WireMock.created;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT webhook + refund/void (plan T7 — spec §5.4/§5.5, ACCEPTANCE "sig sai → 400,
 * đúng → event outbox", §7 case 4/6): single-tx dedupe + status + outbox
 * (envelope 5-field + payload camel/uppercase), refund/void local precheck
 * 404/409 + ProviderConflict → 409 + happy 201/200.
 */
class PaymentWebhookTest extends AbstractPaymentIntegrationTest {

    static final String WHSEC = "whsec_webhook_it";

    @DynamicPropertySource
    static void stripe(DynamicPropertyRegistry registry) {
        registry.add("stripe.secret-key", () -> "sk_test_webhook");
        registry.add("stripe.base-url", STRIPE_WIREMOCK::baseUrl);
        registry.add("stripe.webhook-secret", () -> WHSEC);
    }

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ObjectMapper objectMapper;

    private static final AtomicInteger SEQ = new AtomicInteger();

    private static final String REFUND_JSON = """
        {"id":"re_it_%d","object":"refund","amount":250000,"status":"succeeded",
         "payment_intent":"pi_web","livemode":false}
        """;

    @BeforeEach
    void resetStubs() {
        STRIPE_WIREMOCK.resetAll();
    }

    /** Seed intent (pi_ riêng mỗi test) — status cho trước. */
    private String seedIntent(String piId, String status, long amount) {
        String orderId = "o-web-" + SEQ.incrementAndGet();
        jdbc.update("""
                INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount_vnd, currency,
                                             status, idempotency_key, payload_hash)
                VALUES (?::uuid, ?, ?, ?, 'VND', ?, ?, 'hash')
                """,
            UUID.randomUUID(), orderId, piId, amount, status, "key-" + piId);
        return orderId;
    }

    private ResponseEntity<Map> postWebhook(String type, String piId, long amount) throws Exception {
        String event = webhookEvent(type, piId, amount);
        return rest.postForEntity("/payment/webhook",
            new HttpEntity<>(event, signedHeaders(event)), Map.class);
    }

    private String webhookEvent(String type, String piId, long amount) {
        return """
            {"id":"evt_%s","object":"event","created":%d,
             "type":"%s",
             "data":{"object":{"id":"%s","object":"payment_intent","amount":%d,
                     "currency":"vnd","status":"succeeded","client_secret":"cs_x","livemode":false}}}
            """.formatted(UUID.randomUUID(), Instant.now().getEpochSecond(), type, piId, amount);
    }

    private HttpHeaders signedHeaders(String body) throws Exception {
        long t = Instant.now().getEpochSecond();
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(WHSEC.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = HexFormat.of().formatHex(
            mac.doFinal((t + "." + body).getBytes(StandardCharsets.UTF_8)));
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Stripe-Signature", "t=" + t + ",v1=" + sig);
        return headers;
    }

    private long outboxCount(String eventType) {
        return jdbc.queryForObject("SELECT count(*) FROM outbox WHERE event_type = ?", Long.class, eventType);
    }

    private String lastOutboxPayload(String eventType) {
        return jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = ? ORDER BY created_at DESC LIMIT 1",
            String.class, eventType);
    }

    @Test
    void validSignatureSucceededEmitsPaymentSucceededOutbox() throws Exception {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        String orderId = seedIntent(pi, "REQUIRES_CONFIRMATION", 250000);
        long before = outboxCount("payment.succeeded");

        ResponseEntity<Map> response = postWebhook("payment_intent.succeeded", pi, 250000);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("received")).isEqualTo(Boolean.TRUE);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, pi))
            .isEqualTo("SUCCEEDED");
        assertThat(outboxCount("payment.succeeded")).isEqualTo(before + 1);
        // payload schema: camel keys + currency uppercase + failureReason null
        var envelope = objectMapper.readTree(lastOutboxPayload("payment.succeeded"));
        assertThat(envelope.path("eventType").asText()).isEqualTo("payment.succeeded");
        assertThat(envelope.path("eventId").asText()).isNotBlank();
        assertThat(envelope.path("correlationId").asText()).startsWith("evt_");
        var payload = envelope.path("payload");
        assertThat(payload.path("orderId").asText()).isEqualTo(orderId);
        assertThat(payload.path("paymentIntentId").asText()).isEqualTo(pi);
        assertThat(payload.path("amount").asLong()).isEqualTo(250000);
        assertThat(payload.path("currency").asText()).as("currency uppercase thống nhất").isEqualTo("VND");
        assertThat(payload.has("failureReason")).isTrue();
        assertThat(payload.path("failureReason").isNull()).isTrue();
    }

    @Test
    void badSignatureReturns400WithoutTouchingState() throws Exception {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "REQUIRES_CONFIRMATION", 250000);
        String event = webhookEvent("payment_intent.succeeded", pi, 250000);
        HttpHeaders badHeaders = new HttpHeaders();
        badHeaders.setContentType(MediaType.APPLICATION_JSON);
        badHeaders.set("Stripe-Signature", "t=123,v1=deadbeef");
        long before = outboxCount("payment.succeeded");

        ResponseEntity<Map> response = rest.postForEntity("/payment/webhook", new HttpEntity<>(event, badHeaders), Map.class);

        assertThat(response.getStatusCode().value()).as("ACCEPTANCE: sig sai → 400").isEqualTo(400);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, pi))
            .as("sig sai không đụng state").isEqualTo("REQUIRES_CONFIRMATION");
        assertThat(outboxCount("payment.succeeded")).isEqualTo(before);
    }

    @Test
    void rePostedEventIsDedupedNoSecondOutbox() throws Exception {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "REQUIRES_CONFIRMATION", 250000);
        // CÙNG event json (cùng evt id) post 2 lần
        String event = webhookEvent("payment_intent.succeeded", pi, 250000);
        long before = outboxCount("payment.succeeded");

        rest.postForEntity("/payment/webhook", new HttpEntity<>(event, signedHeaders(event)), Map.class);
        ResponseEntity<Map> second = rest.postForEntity("/payment/webhook",
            new HttpEntity<>(event, signedHeaders(event)), Map.class);

        assertThat(second.getStatusCode().value()).isEqualTo(200);
        assertThat(outboxCount("payment.succeeded")).as("dedupe theo stripe:<evt_id>").isEqualTo(before + 1);
    }

    @Test
    void paymentFailedEmitsFailedEventWithFailureReason() throws Exception {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "REQUIRES_CONFIRMATION", 250000);
        long before = outboxCount("payment.failed");

        String event = """
            {"id":"evt_%s","object":"event","created":%d,
             "type":"payment_intent.payment_failed",
             "data":{"object":{"id":"%s","object":"payment_intent","amount":250000,
                     "currency":"vnd","status":"requires_payment_method","client_secret":"cs_x",
                     "last_payment_error":{"message":"card declined"},"livemode":false}}}
            """.formatted(UUID.randomUUID(), Instant.now().getEpochSecond(), pi);
        ResponseEntity<Map> response = rest.postForEntity("/payment/webhook",
            new HttpEntity<>(event, signedHeaders(event)), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, pi))
            .isEqualTo("FAILED");
        assertThat(outboxCount("payment.failed")).isEqualTo(before + 1);
        var payload = objectMapper.readTree(lastOutboxPayload("payment.failed")).path("payload");
        assertThat(payload.path("failureReason").asText()).isEqualTo("card declined");
    }

    @Test
    void missingSignatureHeaderReturns400Not500() {
        HttpHeaders noSig = new HttpHeaders();
        noSig.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<Map> response = rest.postForEntity("/payment/webhook",
            new HttpEntity<>("{}", noSig), Map.class);

        assertThat(response.getStatusCode().value())
            .as("thiếu Stripe-Signature → 400 (không 500 qua catch-all)").isEqualTo(400);
    }

    @Test
    void chargeRefundedMarksRefundedSilentlyNoOutbox() throws Exception {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        String orderId = seedIntent(pi, "SUCCEEDED", 250000);
        long succeededBefore = outboxCount("payment.succeeded");
        long failedBefore = outboxCount("payment.failed");

        // charge.refunded: data.object = CHARGE (không phải PaymentIntent) — chiếu
        // qua branch instanceof Charge của adapter; silent → KHÔNG outbox row
        String event = """
            {"id":"evt_%s","object":"event","created":%d,
             "type":"charge.refunded",
             "data":{"object":{"id":"ch_%s","object":"charge","amount":250000,
                     "amount_refunded":250000,"currency":"vnd","payment_intent":"%s",
                     "status":"succeeded","livemode":false}}}
            """.formatted(UUID.randomUUID(), Instant.now().getEpochSecond(), pi, pi);
        ResponseEntity<Map> response = rest.postForEntity("/payment/webhook",
            new HttpEntity<>(event, signedHeaders(event)), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, pi))
            .as("charge.refunded → REFUNDED (silent)").isEqualTo("REFUNDED");
        assertThat(outboxCount("payment.succeeded")).as("silent — không emit event").isEqualTo(succeededBefore);
        assertThat(outboxCount("payment.failed")).isEqualTo(failedBefore);
    }

    @Test
    void outOfOrderFailureDoesNotDowngradeSucceededIntent() throws Exception {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "SUCCEEDED", 250000);
        long failedBefore = outboxCount("payment.failed");
        // attempt-1-fail event (payment_failed) tới SAU khi attempt-2 đã succeeded
        String event = """
            {"id":"evt_%s","object":"event","created":%d,
             "type":"payment_intent.payment_failed",
             "data":{"object":{"id":"%s","object":"payment_intent","amount":250000,
                     "currency":"vnd","status":"requires_payment_method","client_secret":"cs_x",
                     "last_payment_error":{"message":"late decline"},"livemode":false}}}
            """.formatted(UUID.randomUUID(), Instant.now().getEpochSecond(), pi);
        ResponseEntity<Map> response = rest.postForEntity("/payment/webhook",
            new HttpEntity<>(event, signedHeaders(event)), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, pi))
            .as("out-of-order FAILED KHÔNG được hạ cấp SUCCEEDED (double-charge/false-failed)")
            .isEqualTo("SUCCEEDED");
        assertThat(outboxCount("payment.failed")).as("không emit false payment.failed").isEqualTo(failedBefore);
    }

    @Test
    void succeededAfterRefundedDoesNotResurrectIntent() throws Exception {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "REFUNDED", 250000);
        long before = outboxCount("payment.succeeded");

        ResponseEntity<Map> response = postWebhook("payment_intent.succeeded", pi, 250000);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, pi))
            .as("succeeded tới sau REFUNDED — không resurrect (security-audit L-1)")
            .isEqualTo("REFUNDED");
        assertThat(outboxCount("payment.succeeded")).isEqualTo(before);
    }

    @Test
    void unknownIntentIsAckedWithoutOutbox() throws Exception {        long before = outboxCount("payment.succeeded");

        ResponseEntity<Map> response = postWebhook("payment_intent.succeeded", "pi_khong_ton_tai", 250000);

        assertThat(response.getStatusCode().value()).as("warn + 200, không 500 storm").isEqualTo(200);
        assertThat(outboxCount("payment.succeeded")).isEqualTo(before);
    }

    @Test
    void refundFullSucceeds201AndMarksRefunded() {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "SUCCEEDED", 250000);
        STRIPE_WIREMOCK.stubFor(post(urlEqualTo("/v1/refunds"))
            .willReturn(created().withBody(REFUND_JSON.formatted(SEQ.incrementAndGet()))));

        ResponseEntity<Map> response = rest.postForEntity("/payment/refunds",
            new HttpEntity<>(Map.of("paymentIntentId", pi, "reason", "admin_cancel"), jsonHeaders()), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getBody().get("refundId")).asString().startsWith("re_it_");
        assertThat(response.getBody().get("amount")).isEqualTo(250000);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, pi))
            .as("full refund → REFUNDED").isEqualTo("REFUNDED");
    }

    @Test
    void refundExceedingAmountReturns409PaymentConflict() {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "SUCCEEDED", 250000);
        STRIPE_WIREMOCK.stubFor(post(urlEqualTo("/v1/refunds"))
            .willReturn(com.github.tomakehurst.wiremock.client.WireMock.badRequest()
                .withBody("{\"error\":{\"code\":\"amount_too_large\",\"message\":\"too much\"}}")));

        ResponseEntity<Map> response = rest.postForEntity("/payment/refunds",
            new HttpEntity<>(Map.of("paymentIntentId", pi, "amount", 999999, "reason", "rma"), jsonHeaders()), Map.class);

        assertThat(response.getStatusCode().value())
            .as("Stripe InvalidRequest (refund vượt) → 409 payment_conflict (contract pin)")
            .isEqualTo(409);
    }

    @Test
    void refundUnknownIntentReturns404() {
        ResponseEntity<Map> response = rest.postForEntity("/payment/refunds",
            new HttpEntity<>(Map.of("paymentIntentId", "pi_ma_khong_co", "reason", "x"), jsonHeaders()), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void refundOnNotCapturedIntentReturns409LocalPrecheck() {
        String pi = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(pi, "REQUIRES_CONFIRMATION", 250000);

        ResponseEntity<Map> response = rest.postForEntity("/payment/refunds",
            new HttpEntity<>(Map.of("paymentIntentId", pi, "reason", "x"), jsonHeaders()), Map.class);

        assertThat(response.getStatusCode().value()).as("local precheck TRƯỚC adapter").isEqualTo(409);
    }

    @Test
    void voidAfterSucceededReturns409VoidCreatedReturns200Canceled() {
        String piDone = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(piDone, "SUCCEEDED", 250000);
        assertThat(rest.postForEntity("/payment/void",
            new HttpEntity<>(Map.of("paymentIntentId", piDone), jsonHeaders()), Map.class)
            .getStatusCode().value()).isEqualTo(409);

        String piNew = "pi_web_" + SEQ.incrementAndGet();
        seedIntent(piNew, "CREATED", 250000);
        STRIPE_WIREMOCK.stubFor(com.github.tomakehurst.wiremock.client.WireMock.get(
                urlEqualTo("/v1/payment_intents/" + piNew))
            .willReturn(okJson("""
                {"id":"%s","object":"payment_intent","amount":250000,"currency":"vnd",
                 "status":"requires_payment_method","client_secret":"cs_x","livemode":false,"metadata":{}}
                """.formatted(piNew))));
        STRIPE_WIREMOCK.stubFor(post(urlEqualTo("/v1/payment_intents/" + piNew + "/cancel"))
            .willReturn(okJson("""
                {"id":"%s","object":"payment_intent","amount":250000,"currency":"vnd",
                 "status":"canceled","client_secret":"cs_x","livemode":false,"metadata":{}}
                """.formatted(piNew))));

        ResponseEntity<Map> response = rest.postForEntity("/payment/void",
            new HttpEntity<>(Map.of("paymentIntentId", piNew), jsonHeaders()), Map.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("status")).as("mirror CANCELED (enum contract)").isEqualTo("CANCELED");
        assertThat(jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?", String.class, piNew))
            .as("DB lifecycle = VOIDED").isEqualTo("VOIDED");
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}
