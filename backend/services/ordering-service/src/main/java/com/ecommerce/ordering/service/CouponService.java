package com.ecommerce.ordering.service;

import com.ecommerce.ordering.api.CouponInvalidException;
import com.ecommerce.ordering.api.dto.CouponDtos.AdminCouponRequest;
import com.ecommerce.ordering.api.dto.CouponDtos.PublicCouponDto;
import com.ecommerce.ordering.api.dto.CouponDtos.ValidateCouponResponse;
import com.ecommerce.ordering.domain.Coupon;
import com.ecommerce.ordering.domain.CouponReservation;
import com.ecommerce.ordering.domain.CouponReservationStatus;
import com.ecommerce.ordering.domain.CouponType;
import com.ecommerce.ordering.repo.CouponRepository;
import com.ecommerce.ordering.repo.CouponReservationRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Sort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
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

    // ── Admin CRUD (FI-366 SF-1 T11 — spec §4.10; contracts A3, FI-371) ─────

    /** GET list admin — TẤT CẢ coupon (cả inactive/hết hạn), sort code. Khác public list (chỉ running, không lộ usage). */
    public List<Coupon> adminList() {
        return coupons.findAll(Sort.by(Sort.Direction.ASC, "code"));
    }

    /** Tạo — code trùng → 409 (controller map). Validation chung {@link #validateAdmin}. */
    public Coupon adminCreate(AdminCouponRequest req) {
        validateAdmin(req);
        String code = req.code() == null ? "" : req.code().trim().toUpperCase(Locale.ROOT);
        if (coupons.findByCode(code).isPresent()) {
            throw new IllegalStateException("Mã giảm giá đã tồn tại: " + code);
        }
        Coupon coupon = new Coupon(code, CouponType.valueOf(req.type()), req.value(),
            req.minOrderValue(),
            req.startsAt() == null ? Instant.now() : req.startsAt(),
            req.endsAt(), req.usageLimit(),
            req.description() == null ? "" : req.description().trim());
        return coupons.save(coupon);
    }

    /** Sửa — preserve used_count (domain {@code applyUpdate}); không thấy → 404 (controller map). */
    public Coupon adminUpdate(String code, AdminCouponRequest req) {
        validateAdmin(req);
        Coupon coupon = coupons.findByCode(code == null ? "" : code.trim().toUpperCase(Locale.ROOT))
            .orElseThrow(() -> new EntityNotFoundException("Mã giảm giá không tồn tại"));
        coupon.applyUpdate(CouponType.valueOf(req.type()), req.value(), req.minOrderValue(),
            req.startsAt() == null ? coupon.getStartsAt() : req.startsAt(),
            req.endsAt(), req.usageLimit(),
            req.active() == null ? coupon.isActive() : req.active(),
            req.description() == null ? coupon.getDescription() : req.description().trim());
        return coupons.save(coupon);
    }

    /**
     * Xóa (N4 — "DELETE cứng chỉ khi chưa reservation"): đang RESERVED → 409
     * (usage đã hứa cho đơn in-flight); có lịch sử RELEASED/FINALIZED → 409
     * (row reservation là audit + FK giữ code — dùng toggle off thay vì xóa);
     * chưa từng có reservation → xóa được.
     */
    public void adminDelete(String code) {
        Coupon coupon = coupons.findByCode(code == null ? "" : code.trim().toUpperCase(Locale.ROOT))
            .orElseThrow(() -> new EntityNotFoundException("Mã giảm giá không tồn tại"));
        if (reservations.countReservedForCoupon(coupon.getCode()) > 0) {
            throw new IllegalStateException("Mã đang có lượt dùng đang giữ (RESERVED) — không xóa được");
        }
        if (reservations.countByCouponCode(coupon.getCode()) > 0) {
            throw new IllegalStateException(
                "Mã đã có lịch sử sử dụng — tắt mã (toggle off) thay vì xóa cứng");
        }
        coupons.delete(coupon);
    }

    /**
     * Toggle active (FI-369 SF-2 A3). N4: off giữa chừng → đơn in-flight đang
     * RESERVED vẫn được finalize (finalize/release không check active), chỉ mã
     * MỚI bị từ chối (validate/reserve qua {@code isRunning}). KHÔNG dùng
     * delete+recreate — mất usedCount + vỡ reservation theo code.
     */
    public Coupon adminSetActive(String code, Boolean active) {
        if (active == null) {
            throw new IllegalArgumentException("active là bắt buộc (true/false)");
        }
        Coupon coupon = coupons.findByCode(code == null ? "" : code.trim().toUpperCase(Locale.ROOT))
            .orElseThrow(() -> new EntityNotFoundException("Mã giảm giá không tồn tại"));
        coupon.setActive(active);
        return coupons.save(coupon);
    }

    /**
     * Validation §4.10: type ∈ {PERCENT, FIXED}; PERCENT value 1-100, FIXED > 0;
     * window endsAt > startsAt; usageLimit null hoặc ≥ 1; minOrderValue ≥ 0.
     * Sai → 400 (controller map ResponseStatusException).
     */
    private void validateAdmin(AdminCouponRequest req) {
        if (req.code() == null || req.code().isBlank()
            || !req.code().trim().matches("[A-Za-z0-9_-]{1,64}")) {
            throw new IllegalArgumentException("code không hợp lệ (1-64 ký tự [A-Za-z0-9_-])");
        }
        CouponType type;
        try {
            type = CouponType.valueOf(req.type());
        } catch (Exception e) {
            throw new IllegalArgumentException("type phải là PERCENT hoặc FIXED");
        }
        if (type == CouponType.PERCENT && (req.value() < 1 || req.value() > 100)) {
            throw new IllegalArgumentException("PERCENT value phải trong [1, 100]");
        }
        if (type == CouponType.FIXED && req.value() <= 0) {
            throw new IllegalArgumentException("FIXED value phải > 0");
        }
        if (req.minOrderValue() != null && req.minOrderValue() < 0) {
            throw new IllegalArgumentException("minOrderValue không âm");
        }
        Instant effectiveStart = req.startsAt() == null ? Instant.now() : req.startsAt();
        if (req.endsAt() != null && !req.endsAt().isAfter(effectiveStart)) {
            throw new IllegalArgumentException("endsAt phải sau startsAt (cửa sổ không rỗng)");
        }
        if (req.usageLimit() != null && req.usageLimit() < 1) {
            throw new IllegalArgumentException("usageLimit phải ≥ 1 (null = không giới hạn)");
        }
    }
}
