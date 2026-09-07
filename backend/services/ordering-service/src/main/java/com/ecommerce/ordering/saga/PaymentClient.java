package com.ecommerce.ordering.saga;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.UUID;

/**
 * Command edge ordering → payment (§3.2 pin): POST /intents (Idempotency-Key)
 * + POST /refunds (late payment / admin cancel sau PAID). Mọi lỗi hạ tầng
 * ({@link RestClientException}) ném tiếp — saga compensation + 502; refund lỗi
 * → caller (consumer/admin path) log + giữ nguyên trạng thái để retry.
 */
@Component
public class PaymentClient {

    private final RestClient rest;

    public PaymentClient(
        RestClient.Builder builder,
        @Value("${ordering.payment.base-url:http://localhost:8086}") String baseUrl,
        @Value("${ordering.payment.timeout-ms:8000}") long timeoutMs
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) timeoutMs);
        factory.setReadTimeout((int) timeoutMs);
        this.rest = builder.requestFactory(factory).baseUrl(baseUrl).build();
    }

    public record IntentCreated(String paymentIntentId, String clientSecret, String status) {
    }

    /** Tạo intent — idempotencyKey = Idempotency-Key của POST /orders (payment dedupe). */
    public IntentCreated createIntent(UUID orderId, long amountVnd, String idempotencyKey) {
        return rest.post()
            .uri("/payment/intents")
            .header("Idempotency-Key", idempotencyKey)
            .body(new IntentBody(orderId.toString(), amountVnd, "VND"))
            .retrieve()
            .body(IntentCreated.class);
    }

    /** Refund toàn bộ — idempotencyKey UUID riêng mỗi lần gọi (payment M-1). */
    public void refund(String paymentIntentId, String reason, UUID idempotencyKey) {
        rest.post()
            .uri("/payment/refunds")
            .header("Idempotency-Key", idempotencyKey.toString())
            .body(new RefundBody(paymentIntentId, null, reason))
            .retrieve()
            .toBodilessEntity();
    }

    /** SF-13 COD: capture tiền mặt lúc giao — runtime endpoint /payment/cod/captures (ADR 0005). */
    public void captureCod(UUID orderId, long amountVnd, UUID idempotencyKey) {
        rest.post()
            .uri("/payment/cod/captures")
            .header("Idempotency-Key", idempotencyKey.toString())
            .body(new CodCaptureBody(orderId.toString(), amountVnd, idempotencyKey.toString()))
            .retrieve()
            .toBodilessEntity();
    }

    record IntentBody(String orderId, long amount, String currency) {
    }

    record RefundBody(String paymentIntentId, Long amount, String reason) {
    }

    record CodCaptureBody(String orderId, long amountVnd, String idempotencyKey) {
    }
}
