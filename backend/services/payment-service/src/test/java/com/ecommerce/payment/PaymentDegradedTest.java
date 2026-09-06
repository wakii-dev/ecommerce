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
}
