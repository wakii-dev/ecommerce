package com.ecommerce.payment.spi;

/** Chữ ký webhook sai/thiếu → 400 (pack ACCEPTANCE: "signature sai → 400"). */
public class WebhookVerificationException extends RuntimeException {

    public WebhookVerificationException(String message) {
        super(message);
    }

    public WebhookVerificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
