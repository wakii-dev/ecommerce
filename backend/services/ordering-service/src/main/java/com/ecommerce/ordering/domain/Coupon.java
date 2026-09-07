package com.ecommerce.ordering.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Coupon — code là PK (khớp PublicCoupon/CreateOrderRequest theo code).
 * {@code usedCount} TĂNG NGAY lúc reserve (nguyên tử qua guarded UPDATE ở
 * {@code CouponRepository}) — 2 đơn song song không vượt usageLimit (§6.1.3);
 * release khi FAILED/CANCELLED hoàn lại. Usage đã reserve được honor kể cả
 * coupon hết hạn sau đó (khớp §6.1.3 — validate chỉ lúc reserve).
 */
@Entity
@Table(name = "coupons")
public class Coupon {

    @Id
    @Column(length = 64)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CouponType type;

    /** PERCENT → % (0-100); FIXED → số VND. */
    @Column(nullable = false)
    private long value;

    @Column(name = "min_order_value")
    private Long minOrderValue;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    /** NULL = không giới hạn. */
    @Column(name = "usage_limit")
    private Integer usageLimit;

    @Column(name = "used_count", nullable = false)
    private int usedCount;

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private String description;

    protected Coupon() {
    }

    public Coupon(String code, CouponType type, long value, Long minOrderValue,
                  Instant startsAt, Instant endsAt, Integer usageLimit, String description) {
        this.code = code;
        this.type = type;
        this.value = value;
        this.minOrderValue = minOrderValue;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.usageLimit = usageLimit;
        this.active = true;
        this.usedCount = 0;
        this.description = description;
    }

    /**
     * Đang chạy hay không — check ĐẦU (validate + coupon center). Sau khi
     * RESERVE thành công thì KHÔNG check lại (usage honor §6.1.3).
     */
    public boolean isRunning(Instant now) {
        return active
            && !now.isBefore(startsAt)
            && (endsAt == null || !now.isAfter(endsAt));
    }

    /** Đơn đủ min-order chưa (NULL minOrderValue = không điều kiện). */
    public boolean meetsMinOrder(long subtotal) {
        return minOrderValue == null || subtotal >= minOrderValue;
    }

    /**
     * Số tiền giảm cho subtotal — % làm tròn XUỐNG (floor §6.1.3); FIXED trừ
     * thẳng nhưng không âm hóa đơn (cap tại subtotal).
     */
    public long discountFor(long subtotal) {
        long raw = switch (type) {
            case PERCENT -> Math.floorDiv(subtotal * value, 100);
            case FIXED -> value;
        };
        return Math.min(raw, subtotal);
    }

    public String getCode() {
        return code;
    }

    public CouponType getType() {
        return type;
    }

    public long getValue() {
        return value;
    }

    public Long getMinOrderValue() {
        return minOrderValue;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    public Integer getUsageLimit() {
        return usageLimit;
    }

    public int getUsedCount() {
        return usedCount;
    }

    public boolean isActive() {
        return active;
    }

    public String getDescription() {
        return description;
    }

    /**
     * Admin update (FI-366 SF-1 T11 — spec §4.10 shape): thay giá trị chính sách,
     * GIỮ nguyên {@code usedCount} (usage đã reserve không mất khi sửa limit/hạn)
     * + gắn cờ active theo request. Không đổi code (PK).
     */
    public void applyUpdate(CouponType type, long value, Long minOrderValue,
                            Instant startsAt, Instant endsAt, Integer usageLimit,
                            boolean active, String description) {
        this.type = type;
        this.value = value;
        this.minOrderValue = minOrderValue;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.usageLimit = usageLimit;
        this.active = active;
        this.description = description;
    }
}
