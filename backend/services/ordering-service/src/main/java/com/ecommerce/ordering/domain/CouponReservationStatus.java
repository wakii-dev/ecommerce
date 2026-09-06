package com.ecommerce.ordering.domain;

/**
 * Trạng thái giữ chỗ coupon (pack pin): RESERVED | FINALIZED | RELEASED.
 * RESERVED → FINALIZED khi đơn CONFIRMED; RESERVED → RELEASED khi đơn
 * FAILED/CANCELLED (hoàn used_count). FINALIZED/RELEASED terminal.
 */
public enum CouponReservationStatus {
    RESERVED,
    FINALIZED,
    RELEASED
}
