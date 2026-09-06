package com.ecommerce.catalog.domain;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * Verified-purchase eligibility (SF-8) — 1 row (user, product) từ event
 * {@code order.confirmed} (fat payload §6.1.5). Insert duy nhất qua native
 * {@code ON CONFLICT DO NOTHING} (repo) — entity phục vụ exists-check.
 */
@Entity
@Table(name = "review_eligibility")
@IdClass(ReviewEligibilityEntity.Pk.class)
public class ReviewEligibilityEntity {

    /** PK composite (user_id, product_id) — mua 2 lần vẫn 1 row (verified là boolean). */
    public static class Pk implements Serializable {

        private UUID userId;
        private UUID productId;

        public Pk() {
            // JPA
        }

        public Pk(UUID userId, UUID productId) {
            this.userId = userId;
            this.productId = productId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Pk pk)) return false;
            return Objects.equals(userId, pk.userId) && Objects.equals(productId, pk.productId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, productId);
        }
    }

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(name = "product_id")
    private UUID productId;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public UUID getProductId() { return productId; }
    public void setProductId(UUID productId) { this.productId = productId; }

    public UUID getOrderId() { return orderId; }
    public void setOrderId(UUID orderId) { this.orderId = orderId; }

    public Instant getCreatedAt() { return createdAt; }
}
