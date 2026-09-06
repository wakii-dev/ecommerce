package com.ecommerce.payment.spi;

/**
 * Kết quả intent từ provider. {@code status} là MIRROR nguyên văn provider trả
 * (enum contract `PaymentIntentStatus`) — KHÔNG phải enum lifecycle nội bộ DB.
 */
public record AdapterIntent(
    String providerIntentId,
    String clientSecret,
    String status
) {
}
