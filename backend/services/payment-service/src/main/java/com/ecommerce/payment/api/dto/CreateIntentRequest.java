package com.ecommerce.payment.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * Body POST /payment/intents — contract `CreateIntentRequest` (orderId, amount,
 * currency enum VND, idempotencyKey). KHÔNG đặt @NotBlank lên idempotencyKey:
 * header `Idempotency-Key` là kênh chính (pack) — body chỉ fallback; service
 * 400 khi thiếu CẢ HAI.
 */
public record CreateIntentRequest(
    @NotBlank @jakarta.validation.constraints.Size(max = 64) String orderId,
    @Positive long amount,
    String currency,
    @jakarta.validation.constraints.Size(max = 128) String idempotencyKey
) {
}
