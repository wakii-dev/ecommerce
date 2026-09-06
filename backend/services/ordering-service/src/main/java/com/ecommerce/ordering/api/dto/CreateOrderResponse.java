package com.ecommerce.ordering.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Khớp contract CreateOrderResponse — clientSecret null khi COD (chưa thuộc
 * SF-9; giữ nullable cho replay đơn FAILED giữa saga không thêm shape mới).
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record CreateOrderResponse(OrderDto order, String clientSecret) {
}
