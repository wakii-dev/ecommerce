package com.ecommerce.ordering.api;

/** payment-service lỗi hạ tầng lúc tạo intent → 502 problem+json (pack step d). */
public class PaymentUnavailableException extends RuntimeException {

    public PaymentUnavailableException(String message) {
        super(message);
    }
}
