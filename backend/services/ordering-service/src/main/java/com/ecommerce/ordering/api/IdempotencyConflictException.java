package com.ecommerce.ordering.api;

/** Trùng Idempotency-Key nhưng KHÁC payload → 409 (contract — không có insufficient[]). */
public class IdempotencyConflictException extends RuntimeException {

    public IdempotencyConflictException(String message) {
        super(message);
    }
}
