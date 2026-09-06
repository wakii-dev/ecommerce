package com.ecommerce.payment.spi;

/** Provider lỗi hạ tầng (connect/auth/quota) — KHÔNG phải state conflict → 502. */
public class ProviderUnavailableException extends RuntimeException {

    public ProviderUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
