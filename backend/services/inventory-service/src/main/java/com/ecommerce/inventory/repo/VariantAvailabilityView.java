package com.ecommerce.inventory.repo;

/**
 * Projection `VariantAvailability` (contract): available = cột quantity
 * (đã net của reservation — trừ lúc reserve); reserved = SUM jsonb các
 * reservation RESERVED còn hạn.
 */
public interface VariantAvailabilityView {
    String getVariantId();

    int getAvailable();

    int getReserved();
}
