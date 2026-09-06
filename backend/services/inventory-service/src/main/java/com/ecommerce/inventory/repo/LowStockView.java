package com.ecommerce.inventory.repo;

/**
 * Projection `LowStockItem` (contract): đủ 5 trường; productId/productName
 * null khi chưa ai fill (REQUIREMENT-GAP FI-310 — denormalized columns).
 */
public interface LowStockView {
    String getVariantId();

    String getProductId();

    String getProductName();

    int getAvailable();

    int getThreshold();
}
