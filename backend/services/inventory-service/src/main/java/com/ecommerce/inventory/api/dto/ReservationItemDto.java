package com.ecommerce.inventory.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/** Body item của POST /inventory/reservations — camelCase (contract CreateReservationRequest). */
public record ReservationItemDto(
    @NotBlank String variantId,
    @Min(1) int qty
) {
}
