package com.ecommerce.payment.api.dto;

/**
 * Response 201 — contract `PaymentIntentCreated`: paymentIntentId (pi_...),
 * clientSecret (FE Stripe Elements confirm), status MIRROR Stripe
 * (`PaymentIntentStatus` enum contract — REQUIRES_PAYMENT_METHOD/.../CANCELED).
 */
public record PaymentIntentCreatedResponse(
    String paymentIntentId,
    String clientSecret,
    String status
) {
}
