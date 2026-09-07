package com.ecommerce.ordering.api;

/** RMA ngoài cửa sổ 7 ngày kể từ DELIVERED (D22) — 409 theo contract createRma. */
public class RmaWindowException extends RuntimeException {

    public RmaWindowException(String message) {
        super(message);
    }
}
