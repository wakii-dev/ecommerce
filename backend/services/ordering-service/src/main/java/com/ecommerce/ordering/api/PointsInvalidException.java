package com.ecommerce.ordering.api;

/** usePoints không dùng được (điểm không đủ / đơn đã redeem) — 422 contract. */
public class PointsInvalidException extends RuntimeException {

    public PointsInvalidException(String message) {
        super(message);
    }
}
