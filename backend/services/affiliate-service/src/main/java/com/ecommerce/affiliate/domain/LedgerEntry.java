package com.ecommerce.affiliate.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Entry sổ hoa hồng (D20) — 1 row/đơn ({@code order_id UNIQUE} = idempotency
 * lớp 2 sau marker eventId của consumer). {@code rate} CHỐT tại thời điểm
 * đơn CONFIRMED — admin đổi rate sau không ảnh hưởng entry cũ (contract:
 * "ledger cũ giữ nguyên rate cũ").
 */
@Entity
@Table(name = "ledger")
public class LedgerEntry {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "affiliate_id", nullable = false)
    private UUID affiliateId;

    @Column(name = "order_id", nullable = false, unique = true, length = 64)
    private String orderId;

    /** Giá trị đơn VND được tính hoa hồng (total của order.confirmed). */
    @Column(name = "order_total", nullable = false)
    private long orderTotal;

    @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal rate;

    /** Hoa hồng VND = floor(order_total × rate / 100). */
    @Column(nullable = false)
    private long commission;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private LedgerStatus status = LedgerStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected LedgerEntry() {
    }

    public LedgerEntry(UUID affiliateId, String orderId, long orderTotal,
                       BigDecimal rate, long commission) {
        this.affiliateId = affiliateId;
        this.orderId = orderId;
        this.orderTotal = orderTotal;
        this.rate = rate;
        this.commission = commission;
    }

    public UUID getId() {
        return id;
    }

    public UUID getAffiliateId() {
        return affiliateId;
    }

    public String getOrderId() {
        return orderId;
    }

    public long getOrderTotal() {
        return orderTotal;
    }

    public BigDecimal getRate() {
        return rate;
    }

    public long getCommission() {
        return commission;
    }

    public LedgerStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
