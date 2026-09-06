package com.ecommerce.inventory.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/**
 * Body POST /inventory/reservations — khớp contract `CreateReservationRequest`
 * (orderId + items; ttlMinutes optional, default 30 khi vắng mặt — contract pin).
 */
public record CreateReservationRequest(
    @NotBlank @jakarta.validation.constraints.Size(max = 64) String orderId,
    @NotEmpty @Valid @jakarta.validation.constraints.Size(max = 100) List<ReservationItemDto> items,
    @jakarta.validation.constraints.Min(1) Integer ttlMinutes
) {
}
