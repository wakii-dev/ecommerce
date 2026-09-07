package com.ecommerce.payment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT capture COD (SF-13 A2): POST /payment/cod/captures → 201, intent row
 * SUCCEEDED id {@code cod:<orderId>}; idempotent — cùng key replay (KHÔNG
 * thêm row), key khác → vẫn 1 row (unique cod:&lt;orderId&gt;).
 */
class CodCaptureTest extends AbstractPaymentIntegrationTest {

    @Autowired
    TestRestTemplate rest;
    @Autowired
    JdbcTemplate jdbc;

    private HttpHeaders headers(UUID idemKey) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Idempotency-Key", idemKey.toString());
        return headers;
    }

    @Test
    void capture_createsSucceededIntent_thenIdempotentReplay() {
        UUID orderId = UUID.randomUUID();
        Map<String, Object> body = Map.of(
            "orderId", orderId.toString(),
            "amountVnd", 250_000,
            "idempotencyKey", "cod-capture-" + orderId);

        var first = rest.exchange("/payment/cod/captures", HttpMethod.POST,
            new HttpEntity<>(body, headers(UUID.randomUUID())), Map.class);
        assertThat(first.getStatusCode().value()).isEqualTo(201);
        assertThat(first.getBody().get("paymentIntentId")).isEqualTo("cod:" + orderId);
        assertThat(first.getBody().get("status")).isEqualTo("succeeded");
        assertThat(first.getBody().get("replay")).isEqualTo(false);

        // replay cùng key
        var second = rest.exchange("/payment/cod/captures", HttpMethod.POST,
            new HttpEntity<>(body, headers(UUID.randomUUID())), Map.class);
        assertThat(second.getBody().get("replay")).isEqualTo(true);

        // key khác — vẫn không double row
        var third = rest.exchange("/payment/cod/captures", HttpMethod.POST,
            new HttpEntity<>(body, headers(UUID.randomUUID())), Map.class);
        assertThat(third.getBody().get("replay")).isEqualTo(true);

        Integer rows = jdbc.queryForObject(
            "SELECT count(*) FROM payment_intents WHERE stripe_intent_id = ?",
            Integer.class, "cod:" + orderId);
        assertThat(rows).isEqualTo(1);
        String status = jdbc.queryForObject(
            "SELECT status FROM payment_intents WHERE stripe_intent_id = ?",
            String.class, "cod:" + orderId);
        assertThat(status).isEqualTo("SUCCEEDED");
    }
}
