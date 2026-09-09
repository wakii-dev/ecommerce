package com.ecommerce.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Tồn kho theo VARIANT (pin §6.1.4) — MỘT cột {@code quantity} = available.
 *
 * <p>Stock model (spec §4.1): reserve TRỪ · release HOÀN · commit GIỮ NGUYÊN
 * (đã trừ từ lúc reserve = "trừ vĩnh viễn"). Không cột reserved riêng —
 * tránh drift 2 nguồn dữ liệu; reserved tính từ jsonb reservations active.</p>
 */
@Entity
@Table(name = "stocks")
public class Stock {

    @Id
    @Column(name = "variant_id", length = 64)
    private String variantId;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "threshold_low", nullable = false)
    private int thresholdLow;

    /** Denormalized nullable — REQUIREMENT-GAP FI-310 (writer-supply sau, không gọi catalog). */
    @Column(name = "product_id", length = 64)
    private String productId;

    @Column(name = "product_name")
    private String productName;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Stock() {
    }

    public Stock(String variantId, int quantity, int thresholdLow, String productId, String productName) {
        this.variantId = variantId;
        this.quantity = quantity;
        this.thresholdLow = thresholdLow;
        this.productId = productId;
        this.productName = productName;
    }

    /** Admin set-stock (FI-397 demo follow-up) — ghi đè quantity + denormalized fields. */
    public void applyAdminSet(int quantity, String productId, String productName) {
        this.quantity = quantity;
        if (productId != null) this.productId = productId;
        if (productName != null) this.productName = productName;
        this.updatedAt = Instant.now();
    }

    public String getVariantId() {
        return variantId;
    }

    public int getQuantity() {
        return quantity;
    }

    public int getThresholdLow() {
        return thresholdLow;
    }

    public String getProductId() {
        return productId;
    }

    public String getProductName() {
        return productName;
    }
}
