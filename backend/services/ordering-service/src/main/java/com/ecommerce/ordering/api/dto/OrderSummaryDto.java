package com.ecommerce.ordering.api.dto;

import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderStatus;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.UUID;

/** Khớp contract OrderSummary — KHÔNG items, có itemsCount (Σ qty). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OrderSummaryDto(
    UUID id,
    UUID userId,
    OrderStatus status,
    int itemsCount,
    long subtotal,
    long discount,
    long shippingFee,
    Long pointsDiscount,
    long total,
    String currency,
    String couponCode,
    String paymentMethod,
    String shippingMethod,
    String trackingCode,
    Instant createdAt,
    Instant updatedAt
) {

    public static OrderSummaryDto from(Order o) {
        return new OrderSummaryDto(
            o.getId(), o.getUserId(), o.getStatus(),
            o.getItems().stream().mapToInt(i -> i.getQty()).sum(),
            o.getSubtotal(), o.getDiscount(), o.getShippingFee(), null,
            o.getTotal(), o.getCurrency(), o.getCouponCode(),
            o.getPaymentMethod(), o.getShippingMethod(), o.getTrackingCode(),
            o.getCreatedAt(), o.getUpdatedAt()
        );
    }
}
