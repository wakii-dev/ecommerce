package com.ecommerce.payment.spi;

/** Lệnh tạo intent từ service → adapter. amountVnd = VND nguyên (zero-decimal). */
public record IntentCommand(
    String orderId,
    long amountVnd,
    String currency,        // 'VND' (uppercase) — adapter tự lowcase cho Stripe
    String idempotencyKey
) {
}
