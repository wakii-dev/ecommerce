package com.ecommerce.ordering.api.dto;

import java.time.Instant;

/**
 * DTO coupon — khớp contract ValidateCouponResponse / PublicCoupon
 * (KHÔNG lộ usageLimit/usedCount nội bộ ra public list).
 */
public final class CouponDtos {

    private CouponDtos() {
    }

    public record ValidateCouponRequest(String code, long subtotal) {
    }

    public record ValidateCouponResponse(boolean valid, long discount, String message) {

        public static ValidateCouponResponse invalid(String reason) {
            return new ValidateCouponResponse(false, 0, reason);
        }
    }

    public record PublicCouponDto(
        String code,
        String type,
        long value,
        Long minOrderValue,
        Instant startsAt,
        Instant endsAt,
        String description
    ) {
    }

    /**
     * Admin CRUD (FI-366 SF-1 T11 — spec §4.10 shape: %, fixed, window, usage
     * limit). Contract contracts/openapi/ordering.yaml amendment A3 (FI-371 —
     * proposal theo baseline shape này, coordinator apply); endpoint thiếu so
     * với A3 = GET list + toggle — SF-2 bổ sung trong khi chờ regen.
     */
    public record AdminCouponRequest(
        String code,
        String type,           // PERCENT | FIXED
        long value,            // PERCENT → 0-100; FIXED → VND > 0
        Long minOrderValue,    // null = không điều kiện
        Instant startsAt,      // null = now
        Instant endsAt,        // null = không hạn
        Integer usageLimit,    // null = không giới hạn
        Boolean active,        // null = true
        String description
    ) {
    }

    public record AdminCouponDto(
        String code,
        String type,
        long value,
        Long minOrderValue,
        Instant startsAt,
        Instant endsAt,
        Integer usageLimit,
        int usedCount,
        boolean active,
        String description
    ) {
    }

    /**
     * Body PUT /admin/coupons/{code}/active (FI-369 SF-2 A3 — toggle N4).
     * Boolean (không primitive) — thiếu field → service trả 400 thay vì âm
     * thầm tắt mã (review P2.1; contract A3: required [active]).
     */
    public record AdminCouponActiveRequest(Boolean active) {
    }
}
