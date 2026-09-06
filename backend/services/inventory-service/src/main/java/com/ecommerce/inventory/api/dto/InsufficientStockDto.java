package com.ecommerce.inventory.api.dto;

/**
 * 1 dòng trong `insufficient[]` của 409 — contract `InsufficientStock`
 * (variantId + requested + available).
 */
public record InsufficientStockDto(
    String variantId,
    int requested,
    int available
) {
}
