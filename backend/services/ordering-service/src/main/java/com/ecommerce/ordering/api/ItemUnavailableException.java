package com.ecommerce.ordering.api;

/** Product/variant không còn khả dụng lúc re-price (§6.1.2) → 422 problem+json. */
public class ItemUnavailableException extends RuntimeException {

    public ItemUnavailableException(String message) {
        super(message);
    }
}
