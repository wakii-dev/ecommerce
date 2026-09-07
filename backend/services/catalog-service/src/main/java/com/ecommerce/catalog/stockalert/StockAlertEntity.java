package com.ecommerce.catalog.stockalert;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * Đăng ký "nhắn tôi khi có hàng" (SF-15, bảng stock_alerts — V12).
 * ACTIVE → (restock checker claim) → NOTIFIED; claim atomic để email đúng 1 lần.
 */
@Entity
@Table(name = "stock_alerts")
public class StockAlertEntity {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_NOTIFIED = "NOTIFIED";

    @Id
    @org.hibernate.annotations.UuidGenerator
    private UUID id;

    @Column(name = "user_email", nullable = false)
    private String userEmail;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "variant_id", nullable = false)
    private UUID variantId;

    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false)
    private String status = STATUS_ACTIVE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "notified_at")
    private Instant notifiedAt;

    public UUID getId() { return id; }
    public String getUserEmail() { return userEmail; }
    public void setUserEmail(String userEmail) { this.userEmail = userEmail; }
    public UUID getProductId() { return productId; }
    public void setProductId(UUID productId) { this.productId = productId; }
    public UUID getVariantId() { return variantId; }
    public void setVariantId(UUID variantId) { this.variantId = variantId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getNotifiedAt() { return notifiedAt; }
    public void setNotifiedAt(Instant notifiedAt) { this.notifiedAt = notifiedAt; }
}
