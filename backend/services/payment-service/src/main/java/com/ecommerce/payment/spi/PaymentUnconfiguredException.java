package com.ecommerce.payment.spi;

/**
 * Provider chưa cấu hình (thiếu STRIPE_SECRET_KEY / webhook secret) →
 * 503 `payment_unconfigured` (pack item 9: boot OK, không crash, 503 rõ ràng).
 */
public class PaymentUnconfiguredException extends RuntimeException {

    public PaymentUnconfiguredException(String message) {
        super(message);
    }
}
