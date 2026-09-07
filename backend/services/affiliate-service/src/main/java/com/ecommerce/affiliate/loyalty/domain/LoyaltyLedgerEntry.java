package com.ecommerce.affiliate.loyalty.domain;

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
 * Entry sổ điểm (D22) — append-only. {@code points} delta có dấu (xem
 * {@link LoyaltyLedgerType}). {@code orderId} nullable (ADJUST thủ công);
 * UNIQUE(order_id, type) ở DB = idempotency earn/redeem theo đơn.
 */
@Entity
@Table(name = "loyalty_ledger")
public class LoyaltyLedgerEntry {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "order_id", length = 64)
    private String orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private LoyaltyLedgerType type;

    @Column(nullable = false)
    private long points;

    @Column(length = 500)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected LoyaltyLedgerEntry() {
    }

    public LoyaltyLedgerEntry(UUID userId, String orderId, LoyaltyLedgerType type,
                              long points, String note) {
        this.userId = userId;
        this.orderId = orderId;
        this.type = type;
        this.points = points;
        this.note = note;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getOrderId() {
        return orderId;
    }

    public LoyaltyLedgerType getType() {
        return type;
    }

    public long getPoints() {
        return points;
    }

    public String getNote() {
        return note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
