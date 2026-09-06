package com.ecommerce.ordering.api;

/**
 * Một variant thiếu hàng — khớp contract {@code InsufficientStock}
 * (variantId/requested/available). available có thể null khi inventory không
 * trả số (chỉ đủ để echo lại đúng shape bắt buộc).
 */
public record InsufficientStockDto(String variantId, long requested, Long available) {
}
