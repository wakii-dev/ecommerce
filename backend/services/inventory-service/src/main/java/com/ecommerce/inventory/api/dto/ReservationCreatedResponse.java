package com.ecommerce.inventory.api.dto;

import java.time.Instant;
import java.util.UUID;

/** Response 201 — contract `ReservationCreated` (reservationId + expiresAt). */
public record ReservationCreatedResponse(
    UUID reservationId,
    Instant expiresAt
) {
}
