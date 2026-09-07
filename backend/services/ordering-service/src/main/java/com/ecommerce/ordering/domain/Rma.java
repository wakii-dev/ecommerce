package com.ecommerce.ordering.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Yêu cầu trả/đổi hàng (SF-14, D22) — {@code items} jsonb
 * (pattern {@link Order#timeline}); tiền không nằm trong RMA — refund MVP
 * FULL đơn đã duyệt (boundary pack: KHÔNG partial-refund theo items),
 * {@code refundAmount} chỉ GHI NHỚ số đã hoàn khi REFUNDED.
 */
@Entity
@Table(name = "rma_requests")
public class Rma {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private RmaStatus status = RmaStatus.REQUESTED;

    @Column(nullable = false, length = 1000)
    private String reason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<RmaLine> items;

    @Column(name = "refund_amount")
    private Long refundAmount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Rma() {
    }

    public Rma(UUID orderId, UUID userId, String reason, List<RmaLine> items) {
        this.orderId = orderId;
        this.userId = userId;
        this.reason = reason;
        this.items = items;
    }

    // ── Mutation có chủ đích (admin path) — KHÔNG setter tự do ─────────────

    /** Đổi trạng thái QUA GUARD lifecycle + cập nhật updatedAt. */
    public void transitionTo(RmaStatus target) {
        if (!status.canTransitionTo(target)) {
            throw new IllegalStateException("Transition RMA không hợp lệ: " + status + " → " + target);
        }
        this.status = target;
        this.updatedAt = Instant.now();
    }

    /** Ghi số tiền đã hoàn khi REFUNDED (MVP full total; COD offline cũng ghi). */
    public void markRefunded(long amount) {
        this.refundAmount = amount;
        this.updatedAt = Instant.now();
    }

    // ── Read ────────────────────────────────────────────────────────────────

    public UUID getId() {
        return id;
    }

    public UUID getOrderId() {
        return orderId;
    }

    public UUID getUserId() {
        return userId;
    }

    public RmaStatus getStatus() {
        return status;
    }

    public String getReason() {
        return reason;
    }

    public List<RmaLine> getItems() {
        return items;
    }

    public Long getRefundAmount() {
        return refundAmount;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
