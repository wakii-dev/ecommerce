package com.ecommerce.payment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT degraded mode (plan T6 — spec §5.6, ACCEPTANCE "Không key → boot OK,
 * /intents 503 rõ"): thiếu STRIPE_SECRET_KEY → BOOT OK, health UP, intents
 * → 503 `payment_unconfigured`. Webhook/refunds/void 503 assert bổ sung ở T7
 * (endpoints sinh ra ở T7).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "stripe.secret-key=",          // blank — StripeSecretKeyPresentCondition phải FALSE
    "stripe.webhook-secret="
})
// NOTE: @SpringBootTest ở subclass THAY THẾ annotation base (không merge) —
// phải re-declare webEnvironment=RANDOM_PORT, không thì local.server.port chết.
class PaymentDegradedTest extends AbstractPaymentIntegrationTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    void bootsWithoutKeyAndHealthIsUp() {
        ResponseEntity<String> health = rest.getForEntity("/actuator/health", String.class);
        assertThat(health.getStatusCode().value()).isEqualTo(200);
        assertThat(health.getBody()).contains("UP");
    }

    @Test
    void createIntentWithoutKeyReturns503PaymentUnconfigured() {
        var body = Map.<String, Object>of("orderId", "o-degraded", "amount", 250000, "currency", "VND");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Idempotency-Key", "key-degraded-1");

        ResponseEntity<String> response = rest.postForEntity(
            "/payment/intents", new HttpEntity<>(body, headers), String.class);

        assertThat(response.getStatusCode().value()).as("ACCEPTANCE: không key → 503 rõ ràng").isEqualTo(503);
        assertThat(response.getBody()).contains("payment_unconfigured");
        assertThat(response.getHeaders().getContentType())
            .as("problem+json RFC 7807").asString().contains("problem+json");
    }

    @Test
    void webhookRefundVoidAllReturn503InDegradedMode() {
        HttpHeaders json = new HttpHeaders();
        json.setContentType(MediaType.APPLICATION_JSON);

        // refund/void: local precheck 404 chạy TRƯỚC adapter — seed intent SUCCEEDED/CREATED
        // (jdbc cùng POSTGRES singleton) để request đi tới adapter → Unconfigured → 503
        String piSucceeded = "pi_degraded_succ_" + System.nanoTime();
        jdbc.update("""
                INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount_vnd, currency,
                                             status, idempotency_key, payload_hash)
                VALUES (?::uuid, 'o-degraded', ?, 250000, 'VND', 'SUCCEEDED', ?, 'hash')
                """,
            java.util.UUID.randomUUID(), piSucceeded, "key-" + piSucceeded);
        String piCreated = "pi_degraded_created_" + System.nanoTime();
        jdbc.update("""
                INSERT INTO payment_intents (id, order_id, stripe_intent_id, amount_vnd, currency,
                                             status, idempotency_key, payload_hash)
                VALUES (?::uuid, 'o-degraded', ?, 250000, 'VND', 'CREATED', ?, 'hash')
                """,
            java.util.UUID.randomUUID(), piCreated, "key-" + piCreated);

        assertThat(rest.postForEntity("/payment/refunds",
            new HttpEntity<>(Map.of("paymentIntentId", piSucceeded, "reason", "r"), json), String.class)
            .getStatusCode().value()).isEqualTo(503);
        assertThat(rest.postForEntity("/payment/void",
            new HttpEntity<>(Map.of("paymentIntentId", piCreated), json), String.class)
            .getStatusCode().value()).isEqualTo(503);
        // webhook: header phải CÓ (thiếu → 400 — đúng behavior); có header → adapter
        // Unconfigured verifyWebhook ném Unconfigured → 503
        HttpHeaders withSig = new HttpHeaders();
        withSig.setContentType(MediaType.APPLICATION_JSON);
        withSig.set("Stripe-Signature", "t=1,v1=degraded");
        assertThat(rest.postForEntity("/payment/webhook",
            new HttpEntity<>("{}", withSig), String.class)
            .getStatusCode().value()).isEqualTo(503);
    }
}
