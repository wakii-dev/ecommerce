package com.ecommerce.payment;

import com.github.tomakehurst.wiremock.client.WireMock;
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

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.serverError;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT intents idempotent (plan T6 — spec §5.3, §7 case 5): replay same key →
 * cùng response (adapter gọi ĐÚNG 1 lần); same key khác payload → 409; rollback
 * adapter-error (không row); retry sau lỗi cùng key → thành công.
 */
class PaymentIntentsTest extends AbstractPaymentIntegrationTest {

    @DynamicPropertySource
    static void stripe(DynamicPropertyRegistry registry) {
        registry.add("stripe.secret-key", () -> "sk_test_intents");
        registry.add("stripe.base-url", STRIPE_WIREMOCK::baseUrl);
        registry.add("stripe.webhook-secret", () -> "whsec_intents");
    }

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    private static final AtomicInteger SEQ = new AtomicInteger();

    static final String PI_JSON = """
        {"id":"pi_it_%d","object":"payment_intent","amount":250000,"currency":"vnd",
         "status":"requires_confirmation","client_secret":"cs_it_secret",
         "automatic_payment_methods":{"enabled":true},"livemode":false,"metadata":{}}
        """;

    @BeforeEach
    void resetStubs() {
        STRIPE_WIREMOCK.resetAll();
        STRIPE_WIREMOCK.stubFor(post(urlEqualTo("/v1/payment_intents"))
            .withRequestBody(containing("amount=250000"))
            .willReturn(okJson(PI_JSON.formatted(SEQ.incrementAndGet()))));
    }

    private ResponseEntity<Map> createIntent(String key, String orderId, long amount, String currency) {
        var body = new java.util.HashMap<String, Object>();
        body.put("orderId", orderId);
        body.put("amount", amount);
        body.put("currency", currency);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (key != null) {
            headers.set("Idempotency-Key", key);
        }
        return rest.postForEntity("/payment/intents", new HttpEntity<>(body, headers), Map.class);
    }

    @Test
    void createIntentReturns201WithMirrorStatusAndStoresRow() {
        ResponseEntity<Map> response = createIntent("key-t6-" + SEQ.incrementAndGet(), "o-1-" + SEQ.get(), 250000, "VND");

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getBody().get("paymentIntentId")).asString().startsWith("pi_it_");
        assertThat(response.getBody().get("clientSecret")).isEqualTo("cs_it_secret");
        assertThat(response.getBody().get("status")).as("mirror Stripe status").isEqualTo("requires_confirmation");
    }

    @Test
    void replaySameKeySamePayloadReturnsSameResultWithoutSecondAdapterCall() {
        String key = "key-t6-replay";
        String orderId = "o-replay-" + SEQ.incrementAndGet();

        ResponseEntity<Map> first = createIntent(key, orderId, 250000, "VND");
        ResponseEntity<Map> second = createIntent(key, orderId, 250000, "VND");

        assertThat(first.getStatusCode().value()).isEqualTo(201);
        assertThat(second.getStatusCode().value()).isEqualTo(201);
        assertThat(second.getBody()).isEqualTo(first.getBody());
        // adapter gọi ĐÚNG 1 lần — replay không đụng Stripe
        STRIPE_WIREMOCK.verify(1, WireMock.postRequestedFor(urlEqualTo("/v1/payment_intents")));
    }

    @Test
    void sameKeyDifferentPayloadReturns409() {
        String key = "key-t6-conflict";
        createIntent(key, "o-a-" + SEQ.incrementAndGet(), 250000, "VND");

        ResponseEntity<Map> second = createIntent(key, "o-b-" + SEQ.incrementAndGet(), 99000, "VND");

        assertThat(second.getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void headerKeyWinsOverBodyKey() {
        String orderId = "o-header-" + SEQ.incrementAndGet();
        ResponseEntity<Map> viaHeader = createIntent("key-t6-header", orderId, 250000, "VND");
        assertThat(viaHeader.getStatusCode().value()).isEqualTo(201);

        // body cùng key → replay (chứng minh header key đã chiếm idempotency slot)
        var body = Map.<String, Object>of(
            "orderId", orderId, "amount", 250000, "currency", "VND", "idempotencyKey", "key-t6-header");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> viaBody = rest.postForEntity("/payment/intents", new HttpEntity<>(body, headers), Map.class);
        assertThat(viaBody.getBody()).isEqualTo(viaHeader.getBody());
    }

    @Test
    void validationErrorsReturn400() {
        assertThat(createIntent(null, "o-x", 250000, "VND").getStatusCode().value())
            .as("thiếu key cả header lẫn body → 400").isEqualTo(400);
        assertThat(createIntent("k-t6", "o-x", 0, "VND").getStatusCode().value())
            .as("amount 0 → 400").isEqualTo(400);
        assertThat(createIntent("k-t6", "o-x", 250000, "USD").getStatusCode().value())
            .as("currency USD → 400 (contract enum VND)").isEqualTo(400);
    }

    @Test
    void providerErrorReturns502AndRollsBackRow() {
        STRIPE_WIREMOCK.resetAll();
        STRIPE_WIREMOCK.stubFor(post(urlEqualTo("/v1/payment_intents"))
            .willReturn(serverError().withBody("{\"error\":{\"message\":\"boom\"}}")));

        ResponseEntity<Map> response = createIntent("key-t6-fail", "o-fail-" + SEQ.incrementAndGet(), 250000, "VND");

        assertThat(response.getStatusCode().value()).as("Stripe 5xx → 502").isEqualTo(502);
        Integer rows = jdbc.queryForObject(
            "SELECT count(*) FROM payment_intents WHERE idempotency_key = 'key-t6-fail'", Integer.class);
        assertThat(rows).as("adapter lỗi → KHÔNG giữ row (replay không gặp row thiếu pi_)").isZero();
    }

    @Test
    void retryWithSameKeyAfterFailureSucceeds() {
        String key = "key-t6-retry";
        String orderId = "o-retry-" + SEQ.incrementAndGet();

        STRIPE_WIREMOCK.resetAll();
        STRIPE_WIREMOCK.stubFor(post(urlEqualTo("/v1/payment_intents"))
            .willReturn(serverError().withBody("{\"error\":{\"message\":\"boom\"}}")));
        assertThat(createIntent(key, orderId, 250000, "VND").getStatusCode().value()).isEqualTo(502);

        STRIPE_WIREMOCK.resetAll();
        STRIPE_WIREMOCK.stubFor(post(urlEqualTo("/v1/payment_intents"))
            .willReturn(okJson(PI_JSON.formatted(SEQ.incrementAndGet()))));
        ResponseEntity<Map> retry = createIntent(key, orderId, 250000, "VND");

        assertThat(retry.getStatusCode().value()).as("rollback sạch → retry cùng key tạo lại từ đầu").isEqualTo(201);
    }
}
