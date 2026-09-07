package com.ecommerce.ordering.api;

/** Coupon không hợp lệ (sai code / hết hạn / không đủ min / hết lượt) → 422 problem+json (contract). */
public class CouponInvalidException extends RuntimeException {

    public CouponInvalidException(String message) {
        super(message);
    }
}
