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
}
