package com.ecommerce.ordering.service;

import com.ecommerce.ordering.api.CouponInvalidException;
import com.ecommerce.ordering.api.dto.CouponDtos.PublicCouponDto;
import com.ecommerce.ordering.api.dto.CouponDtos.ValidateCouponResponse;
import com.ecommerce.ordering.domain.Coupon;
import com.ecommerce.ordering.domain.CouponReservation;
import com.ecommerce.ordering.domain.CouponReservationStatus;
import com.ecommerce.ordering.repo.CouponRepository;
import com.ecommerce.ordering.repo.CouponReservationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Coupon: validate (không reserve — FE realtime), public list (coupon center),
 * reserve nguyên tử (saga step b) + finalize/release theo lifecycle đơn
 * (§6.1.3). used_count TĂNG lúc reserve — guarded UPDATE trong repo là điểm
 * nguyên tử chống 2 đơn song song vượt limit.
 */
@Service
public class CouponService {

    private static final Logger log = LoggerFactory.getLogger(CouponService.class);

    private final CouponRepository coupons;
    private final CouponReservationRepository reservations;

    public CouponService(CouponRepository coupons, CouponReservationRepository reservations) {
        this.coupons = coupons;
        this.reservations = reservations;
    }

    /** POST /orders/validate-coupon — KHÔNG tác động usage (contract). */
    public ValidateCouponResponse validate(String code, long subtotal) {
        Instant now = Instant.now();
        return coupons.findByCode(code == null ? "" : code.trim())
            .map(c -> {
                if (!c.isRunning(now)) {
                    return ValidateCouponResponse.invalid("Mã giảm giá không còn hiệu lực");
                }
                if (!c.meetsMinOrder(subtotal)) {
                    return ValidateCouponResponse.invalid(
                        "Đơn tối thiểu " + c.getMinOrderValue() + "đ để dùng mã này");
                }
                if (c.getUsageLimit() != null && c.getUsedCount() >= c.getUsageLimit()) {
                    return ValidateCouponResponse.invalid("Mã đã hết lượt sử dụng");
                }
                return new ValidateCouponResponse(true, c.discountFor(subtotal), null);
            })
            .orElseGet(() -> ValidateCouponResponse.invalid("Mã giảm giá không tồn tại"));
    }

    /** GET /coupons/public — chỉ coupon đang chạy, KHÔNG lộ usage-limit/used-count. */
    public List<PublicCouponDto> listPublic() {
        Instant now = Instant.now();
        return coupons.findRunning(now).stream()
            .map(c -> new PublicCouponDto(c.getCode(), c.getType().name(), c.getValue(),
                c.getMinOrderValue(), c.getStartsAt(), c.getEndsAt(), c.getDescription()))
            .toList();
    }

    /**
     * Reserve nguyên tử (saga step b) — chạy TRONG tx caller:
     * guarded UPDATE (điều kiện active/window/limit dùng used_count trong cùng
     * statement) → rowcount 0 = không giữ được → 422 kèm lý do đọc lại.
     * Trả discount đã tính (subtotal KHÔNG đổi sau reserve — re-price xong).
     */
    public long reserve(UUID orderId, String code, long subtotal) {
        Instant now = Instant.now();
        String normalized = code == null ? "" : code.trim();
        Coupon coupon = coupons.findByCode(normalized)
            .orElseThrow(() -> new CouponInvalidException("Mã giảm giá không tồn tại"));
        if (!coupon.isRunning(now)) {
            throw new CouponInvalidException("Mã giảm giá không còn hiệu lực");
        }
        if (!coupon.meetsMinOrder(subtotal)) {
            throw new CouponInvalidException("Đơn tối thiểu " + coupon.getMinOrderValue() + "đ để dùng mã này");
        }
        if (coupons.reserveUsage(normalized, now) != 1) {
            // race lost: vừa hết hạn / hết lượt / inactive giữa 2 statement
            throw new CouponInvalidException("Mã giảm giá không còn lượt sử dụng");
        }
        reservations.save(new CouponReservation(orderId, normalized));
        log.info("Coupon {} RESERVED cho đơn {} (used={}/{})",
            normalized, orderId, coupon.getUsedCount() + 1, coupon.getUsageLimit());
        return coupon.discountFor(subtotal);
    }

    /** RESERVED → RELEASED + hoàn used_count — gọi TRONG tx (rowcount-gated, idempotent). */
    public void releaseForOrder(UUID orderId) {
        reservations.findByOrderId(orderId)
            .filter(r -> r.getStatus() == CouponReservationStatus.RESERVED)
            .ifPresent(r -> {
                if (reservations.transition(orderId, CouponReservationStatus.RESERVED,
                    CouponReservationStatus.RELEASED) == 1) {
                    coupons.releaseUsage(r.getCouponCode());
                    log.info("Coupon {} RELEASED cho đơn {}", r.getCouponCode(), orderId);
                }
            });
    }

    /** RESERVED → FINALIZED khi đơn CONFIRMED (used_count đã đếm lúc reserve). */
    public void finalizeForOrder(UUID orderId) {
        reservations.findByOrderId(orderId)
            .filter(r -> r.getStatus() == CouponReservationStatus.RESERVED)
            .ifPresent(r -> {
                if (reservations.transition(orderId, CouponReservationStatus.RESERVED,
                    CouponReservationStatus.FINALIZED) != 1) {
                    log.warn("Coupon finalize race tại đơn {} — path khác đã xử lý", orderId);
                }
            });
    }
}
