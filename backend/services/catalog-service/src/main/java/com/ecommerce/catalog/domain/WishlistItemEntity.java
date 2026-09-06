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
 * Wishlist item (SF-8) — unique pair (user, product) khớp V11
 * {@code wishlist_items}. PK composite do service chỉ định (PUT idempotent —
 * insert ON CONFLICT DO NOTHING).
 */
@Entity
@Table(name = "wishlist_items")
@IdClass(WishlistItemEntity.Pk.class)
public class WishlistItemEntity {

    /** PK composite (user_id, product_id). */
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

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public UUID getProductId() { return productId; }
    public void setProductId(UUID productId) { this.productId = productId; }

    public Instant getCreatedAt() { return createdAt; }
}
