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
 * Hồ sơ affiliate (D20) — 1 user có TỐI ĐA 1 hồ sơ (user_id UNIQUE).
 * {@code code} null tới khi APPROVED (approve sinh code 8 ký tự unique +
 * rate mặc hệ thống); {@code commissionRate} null → fallback
 * {@code affiliate.default-rate} env lúc tính hoa hồng.
 */
@Entity
@Table(name = "affiliates")
public class Affiliate {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(unique = true, length = 8)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AffiliateStatus status = AffiliateStatus.PENDING;

    /** Tỷ lệ hoa hồng (%) — null → fallback env AFFILIATE_DEFAULT_RATE. */
    @Column(name = "commission_rate", precision = 4, scale = 2)
    private BigDecimal commissionRate;

    @Column(name = "portfolio_url", length = 500)
    private String portfolioUrl;

    @Column(length = 1000)
    private String note;

    @Column(name = "payout_note", length = 500)
    private String payoutNote;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Affiliate() {
    }

    public Affiliate(UUID userId, String portfolioUrl, String note) {
        this.userId = userId;
        this.portfolioUrl = portfolioUrl;
        this.note = note;
    }

    /** Approve — chỉ PENDING; sinh ref code + rate mặc định hệ thống. */
    public void approve(String generatedCode, BigDecimal defaultRate) {
        if (this.status != AffiliateStatus.PENDING) {
            throw new IllegalStateException("Hồ sơ không ở trạng thái PENDING");
        }
        this.status = AffiliateStatus.APPROVED;
        this.code = generatedCode;
        this.commissionRate = defaultRate;
    }

    /** Reject — chỉ PENDING (contract); user đăng ký lại sau. */
    public void reject() {
        if (this.status != AffiliateStatus.PENDING) {
            throw new IllegalStateException("Hồ sơ không ở trạng thái PENDING");
        }
        this.status = AffiliateStatus.REJECTED;
    }

    /**
     * Đăng ký lại sau REJECTED (contract: "user có thể đăng ký lại sau") —
     * reset hồ sơ về PENDING với note mới (không tạo row thứ 2 — user_id UNIQUE).
     */
    public void resubmit(String portfolioUrl, String note) {
        if (this.status != AffiliateStatus.REJECTED) {
            throw new IllegalStateException("Hồ sơ không ở trạng thái REJECTED");
        }
        this.status = AffiliateStatus.PENDING;
        this.portfolioUrl = portfolioUrl;
        this.note = note;
    }

    /** Suspend (additive — acceptance pack): APPROVED ↔ SUSPENDED. */
    public void suspend() {
        if (this.status != AffiliateStatus.APPROVED) {
            throw new IllegalStateException("Chỉ APPROVED mới suspend được");
        }
        this.status = AffiliateStatus.SUSPENDED;
    }

    public void reactivate() {
        if (this.status != AffiliateStatus.SUSPENDED) {
            throw new IllegalStateException("Chỉ SUSPENDED mới reactivate được");
        }
        this.status = AffiliateStatus.APPROVED;
    }

    /** Đổi rate (admin) — chỉ áp cho đơn SAU; ledger cũ giữ rate cũ (contract). */
    public void changeRate(BigDecimal rate) {
        this.commissionRate = rate;
    }

    /** Rate áp dụng cho đơn mới — null → fallback mặc định. */
    public BigDecimal effectiveRate(BigDecimal fallbackRate) {
        return this.commissionRate != null ? this.commissionRate : fallbackRate;
    }

    public boolean isApproved() {
        return this.status == AffiliateStatus.APPROVED;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getCode() {
        return code;
    }

    public AffiliateStatus getStatus() {
        return status;
    }

    public BigDecimal getCommissionRate() {
        return commissionRate;
    }

    public String getPortfolioUrl() {
        return portfolioUrl;
    }

    public String getNote() {
        return note;
    }

    public String getPayoutNote() {
        return payoutNote;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setPayoutNote(String payoutNote) {
        this.payoutNote = payoutNote;
    }
}
