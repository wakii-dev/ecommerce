package com.ecommerce.affiliate.loyalty.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * Tài khoản điểm 1 user (D22) — {@code user_id} là PK (1-1 với identity).
 * {@code balance} CHECK ≥ 0 ở DB — redeem atomic ở repo không bao giờ âm.
 */
@Entity
@Table(name = "loyalty_accounts")
public class LoyaltyAccount {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(nullable = false)
    private long balance;

    @Column(name = "total_earned", nullable = false)
    private long totalEarned;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected LoyaltyAccount() {
    }

    public LoyaltyAccount(UUID userId) {
        this.userId = userId;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public long getBalance() {
        return balance;
    }

    public long getTotalEarned() {
        return totalEarned;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
