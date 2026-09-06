package com.ecommerce.payment.api.dto;

/** Response 201 — contract `RefundCreated`: refundId (re_...), status mirror, amount thực refund. */
public record RefundCreatedResponse(
    String refundId,
    String status,
    long amount
) {
}
