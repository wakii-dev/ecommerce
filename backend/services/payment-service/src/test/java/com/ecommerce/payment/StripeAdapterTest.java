package com.ecommerce.payment;

import com.ecommerce.payment.spi.AdapterIntent;
import com.ecommerce.payment.spi.AdapterRefund;
import com.ecommerce.payment.spi.IntentCommand;
import com.ecommerce.payment.spi.PaymentUnconfiguredException;
import com.ecommerce.payment.spi.ProviderWebhookEvent;
import com.ecommerce.payment.spi.StripeAdapter;
import com.ecommerce.payment.spi.WebhookVerificationException;
import com.github.tomakehurst.wiremock.WireMockServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;

import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.created;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.serverError;
import static com.github.tomakehurst.wiremock.client.WireMock.stubFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.verify;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * StripeAdapter unit với WireMock double (plan T5) — deterministic, KHÔNG Docker:
 * create/void/refund qua HTTP thật tới stub + verify Stripe-side Idempotency-Key
 * header + verify HMAC webhook (tự compute signature — stripe-java chỉ có verify).
 */
class StripeAdapterTest {

    static WireMockServer wiremock;
    static StripeAdapter adapter;
    static final String WHSEC = "whsec_test_123";

    static final String PI_JSON = """
        {"id":"pi_test_123","object":"payment_intent","amount":250000,"currency":"vnd",
         "status":"requires_confirmation","client_secret":"cs_test_secret",
         "automatic_payment_methods":{"enabled":true},"livemode":false,"metadata":{}}
        """;
    static final String PI_CANCELED_JSON = """
        {"id":"pi_test_123","object":"payment_intent","amount":250000,"currency":"vnd",
         "status":"canceled","client_secret":"cs_test_secret","livemode":false,"metadata":{}}
        """;
    static final String REFUND_JSON = """
        {"id":"re_test_1","object":"refund","amount":100000,"status":"succeeded",
         "payment_intent":"pi_test_123","livemode":false}
        """;
    static final String WEBHOOK_EVENT_JSON = """
        {"id":"evt_test_1","object":"event","created":%d,
         "type":"payment_intent.succeeded",
         "data":{"object":{"id":"pi_test_123","object":"payment_intent","amount":250000,
                 "currency":"vnd","status":"succeeded","client_secret":"cs_x","livemode":false}}}
        """.formatted(Instant.now().getEpochSecond());

    @BeforeAll
    static void setup() {
        wiremock = new WireMockServer(options().dynamicPort());
        wiremock.start();
        adapter = new StripeAdapter("sk_test_abc", wiremock.baseUrl(), WHSEC);
    }

    @AfterAll
    static void teardown() {
        wiremock.stop();
    }

    @Test
    void createIntentSendsAmountCurrencyAndStripeSideIdempotencyKey() {
        wiremock.stubFor(post(urlEqualTo("/v1/payment_intents"))
            .willReturn(okJson(PI_JSON)));

        AdapterIntent result = adapter.createIntent(new IntentCommand("order-1", 250000, "VND", "idem-key-1"));

        assertThat(result.providerIntentId()).isEqualTo("pi_test_123");
        assertThat(result.clientSecret()).isEqualTo("cs_test_secret");
        assertThat(result.status()).as("mirror UPPERCASE (enum contract)").isEqualTo("REQUIRES_CONFIRMATION");
        wiremock.verify(postRequestedFor(urlEqualTo("/v1/payment_intents"))
            .withHeader("Authorization", containing("sk_test_abc"))
            .withHeader("Idempotency-Key", equalTo("idem-key-1"))
            .withRequestBody(containing("amount=250000"))
            .withRequestBody(containing("currency=vnd")));
    }

    @Test
    void voidIntentCancelsAndReturnsMirrorStatus() {
        // stripe-java cancel = GET retrieve trước (instance method), POST cancel sau
        wiremock.stubFor(com.github.tomakehurst.wiremock.client.WireMock.get(
                urlEqualTo("/v1/payment_intents/pi_test_123"))
            .willReturn(okJson(PI_JSON)));
        wiremock.stubFor(post(urlEqualTo("/v1/payment_intents/pi_test_123/cancel"))
            .willReturn(okJson(PI_CANCELED_JSON)));

        AdapterIntent result = adapter.voidIntent("pi_test_123");

        assertThat(result.providerIntentId()).isEqualTo("pi_test_123");
        assertThat(result.status()).as("mirror UPPERCASE (enum contract)").isEqualTo("CANCELED");
    }

    @Test
    void refundPostsAmountAndReturnsAdapterRefund() {
        wiremock.stubFor(post(urlEqualTo("/v1/refunds")).willReturn(created().withBody(REFUND_JSON)));

        AdapterRefund result = adapter.refund("pi_test_123", 100000L);

        assertThat(result.refundId()).isEqualTo("re_test_1");
        assertThat(result.status()).as("mirror UPPERCASE (contract RefundStatus enum)").isEqualTo("SUCCEEDED");
        assertThat(result.amount()).isEqualTo(100000);
        wiremock.verify(postRequestedFor(urlEqualTo("/v1/refunds"))
            .withRequestBody(containing("payment_intent=pi_test_123"))
            .withRequestBody(containing("amount=100000")));
    }

    @Test
    void providerErrorSurfacesAsTypedException() {
        wiremock.stubFor(post(urlEqualTo("/v1/payment_intents"))
            .willReturn(serverError().withBody("{\"error\":{\"message\":\"boom\"}}")));

        assertThatThrownBy(() -> adapter.createIntent(new IntentCommand("order-1", 1, "VND", "k")))
            .as("Stripe 5xx → ProviderUnavailableException (service map 502)")
            .isInstanceOf(com.ecommerce.payment.spi.ProviderUnavailableException.class);
    }

    @Test
    void verifyWebhookAcceptsValidHmacAndParsesIntent() {
        long timestamp = Instant.now().getEpochSecond();
        String signature = signHeader(WHSEC, WEBHOOK_EVENT_JSON, timestamp);

        ProviderWebhookEvent event = adapter.verifyWebhook(WEBHOOK_EVENT_JSON, "t=" + timestamp + ",v1=" + signature);

        assertThat(event.eventId()).isEqualTo("evt_test_1");
        assertThat(event.type()).isEqualTo("payment_intent.succeeded");
        assertThat(event.intentId()).isEqualTo("pi_test_123");
        assertThat(event.amount()).isEqualTo(250000);
        assertThat(event.currency()).isEqualTo("vnd");
        assertThat(event.failureMessage()).isNull();
    }

    @Test
    void verifyWebhookRejectsBadSignature() {
        long timestamp = Instant.now().getEpochSecond();
        String wrongSig = signHeader("whsec_khac", WEBHOOK_EVENT_JSON, timestamp);

        assertThatThrownBy(() -> adapter.verifyWebhook(WEBHOOK_EVENT_JSON, "t=" + timestamp + ",v1=" + wrongSig))
            .isInstanceOf(WebhookVerificationException.class);
    }

    @Test
    void verifyWebhookRejectsGarbageHeader() {
        assertThatThrownBy(() -> adapter.verifyWebhook(WEBHOOK_EVENT_JSON, "garbage"))
            .isInstanceOf(WebhookVerificationException.class);
    }

    @Test
    void blankWebhookSecretThrowsUnconfigured() {
        StripeAdapter noSecret = new StripeAdapter("sk_test_abc", wiremock.baseUrl(), "");

        assertThatThrownBy(() -> noSecret.verifyWebhook(WEBHOOK_EVENT_JSON, "t=1,v1=abc"))
            .isInstanceOf(PaymentUnconfiguredException.class);
    }

    /** Stripe signature scheme: v1 = HMAC-SHA256(secret, "{t}.{payload}") hex. */
    private static String signHeader(String secret, String payload, long timestamp) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signature = mac.doFinal((timestamp + "." + payload).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(signature);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
