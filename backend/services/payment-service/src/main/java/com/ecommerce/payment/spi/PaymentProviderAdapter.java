package com.ecommerce.payment.spi;

/**
 * SPI cổng payment provider (D3 — pin epic §3.3): Stripe là adapter đầu tiên;
 * VNPay/MoMo/COD (D21) sau này = adapter mới, KHÔNG đổi contract/API.
 *
 * <p>Triết lý: service lo idempotency + outbox + state; adapter chỉ dịch
 * lệnh sang HTTP provider và verify webhook. Mọi tiền là số nguyên VND
 * (zero-decimal — D10).</p>
 */
public interface PaymentProviderAdapter {

    /** Tạo intent — adapter BẮT BUỘC gởi {@code idempotencyKey} lên provider (chống orphan double `pi_` khi local rollback). */
    AdapterIntent createIntent(IntentCommand command);

    /** Void (hủy trước capture) — provider từ chối → adapter ném exception chuẩn. */
    AdapterIntent voidIntent(String providerIntentId);

    /** Refund (full khi {@code amountVnd} null, partial khi có). */
    AdapterRefund refund(String providerIntentId, Long amountVnd);

    /**
     * Verify chữ ký webhook (HMAC) rồi parse event. Sai chữ ký / header hỏng →
     * {@link WebhookVerificationException}; provider chưa cấu hình secret →
     * {@link PaymentUnconfiguredException}.
     */
    ProviderWebhookEvent verifyWebhook(String rawBody, String signatureHeader);
}
