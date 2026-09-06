package com.ecommerce.payment.spi;

/**
 * Adapter khi không có STRIPE_SECRET_KEY — BEAN VẪN TỒN TẠI (controller gọi
 * thoải mái) nhưng MỌI method ném {@link PaymentUnconfiguredException} → 503
 * `payment_unconfigured` (pack item 9). Boot OK, scheduler/outbox vẫn chạy.
 */
public class UnconfiguredAdapter implements PaymentProviderAdapter {

    static final String DEFAULT_MESSAGE =
        "payment chưa cấu hình — đặt STRIPE_SECRET_KEY (test key) trong .env rồi restart payment-service";

    @Override
    public AdapterIntent createIntent(IntentCommand command) {
        throw new PaymentUnconfiguredException(DEFAULT_MESSAGE);
    }

    @Override
    public AdapterIntent voidIntent(String providerIntentId, String idempotencyKey) {
        throw new PaymentUnconfiguredException(DEFAULT_MESSAGE);
    }

    @Override
    public AdapterRefund refund(String providerIntentId, Long amountVnd, String idempotencyKey) {
        throw new PaymentUnconfiguredException(DEFAULT_MESSAGE);
    }

    @Override
    public ProviderWebhookEvent verifyWebhook(String rawBody, String signatureHeader) {
        throw new PaymentUnconfiguredException(
            "payment chưa cấu hình — đặt STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET trong .env rồi restart");
    }
}
