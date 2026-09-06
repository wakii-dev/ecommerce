package com.ecommerce.ordering.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * Giữ chỗ usage coupon theo đơn — lifecycle: RESERVED (lúc POST /orders)
 * → FINALIZED (đơn CONFIRMED) hoặc RELEASED (đơn FAILED/CANCELLED).
 * UNIQUE (order_id) — 1 coupon/đơn (CreateOrderRequest chỉ có 1 couponCode).
 */
@Entity
@Table(name = "coupon_reservations")
public class CouponReservation {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "coupon_code", nullable = false, length = 64)
    private String couponCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CouponReservationStatus status = CouponReservationStatus.RESERVED;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected CouponReservation() {
    }

    public CouponReservation(UUID orderId, String couponCode) {
        this.orderId = orderId;
        this.couponCode = couponCode;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrderId() {
        return orderId;
    }

    public String getCouponCode() {
        return couponCode;
    }

    public CouponReservationStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
