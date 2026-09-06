package com.ecommerce.ordering.api.dto;

import com.ecommerce.ordering.domain.OrderItem;

import java.util.UUID;

/** Dòng hàng response — khớp contract OrderLine (lineTotal = qty × unitPrice). */
public record OrderLineDto(
    UUID id,
    UUID productId,
    UUID variantId,
    String name,
    int qty,
    long unitPrice,
    long lineTotal
) {

    public static OrderLineDto from(OrderItem item) {
        return new OrderLineDto(item.getId(), item.getProductId(), item.getVariantId(),
            item.getName(), item.getQty(), item.getUnitPrice(), item.getLineTotal());
    }
}
