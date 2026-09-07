package com.ecommerce.ordering.api;

/** shippingMethod không khớp danh sách flat-fee → 400 problem+json. */
public class InvalidShippingMethodException extends RuntimeException {

    public InvalidShippingMethodException(String message) {
        super(message);
    }
}
