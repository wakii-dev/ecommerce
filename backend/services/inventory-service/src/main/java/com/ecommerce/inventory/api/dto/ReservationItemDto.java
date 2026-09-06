package com.ecommerce.inventory.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body item của POST /inventory/reservations — camelCase (contract
 * CreateReservationRequest). @Max qty: chặn integer-overflow khi gom trùng
 * (2 dòng qty ~2^31 cộng wrap thành ÂM → deduct(-n) TĂNG stock — code-review P0).
 */
public record ReservationItemDto(
    @NotBlank @Size(max = 64) String variantId,
    @Min(1) @Max(1_000_000) int qty
) {
}
