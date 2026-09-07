package com.ecommerce.ordering.api;

/** Catalog không trả lời / lỗi hạ tầng lúc re-price → 502 problem+json (saga fail). */
public class PricingUnavailableException extends RuntimeException {

    public PricingUnavailableException(String message) {
        super(message);
    }
}
