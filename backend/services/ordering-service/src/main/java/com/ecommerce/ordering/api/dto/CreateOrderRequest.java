package com.ecommerce.ordering.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * POST /orders body — khớp contract CreateOrderRequest. paymentMethod mặc định
 * stripe; COD (D21) + usePoints (D22) saga chặn 400 rõ ràng (chưa thuộc scope SF-9).
 */
public record CreateOrderRequest(
    @NotEmpty @Size(max = 50) @Valid List<Item> items,
    String couponCode,
    @Positive Integer usePoints,
    String paymentMethod,
    @NotBlank String shippingMethod,
    String affiliateCode,
    @NotNull @Valid AddressDto address
) {

    public record Item(
        @NotNull UUID productId,
        @NotNull UUID variantId,
        @Positive int qty
    ) {
    }
}
