package com.ecommerce.payment.api.dto;

/** Response 200 — contract `VoidResult`: status mirror PaymentIntentStatus (CANCELED). */
public record VoidResultResponse(
    String status
) {
}
