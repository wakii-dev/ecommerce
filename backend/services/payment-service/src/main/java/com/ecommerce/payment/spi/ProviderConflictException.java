package com.ecommerce.payment.spi;

/**
 * Provider từ chối lệnh vì STATE conflict (refund vượt amount, already refunded,
 * not cancellable — đúng 2 case 409 contract khai) → service map 409 payment_conflict.
 */
public class ProviderConflictException extends RuntimeException {

    public ProviderConflictException(String message) {
        super(message);
    }
}
