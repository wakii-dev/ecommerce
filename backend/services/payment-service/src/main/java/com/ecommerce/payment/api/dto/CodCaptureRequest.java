package com.ecommerce.payment.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * Capture tiền mặt COD lúc giao hàng (SF-13 A2 — runtime endpoint additive,
 * ADR 0005: KHÔNG nằm trong payment.yaml freeze; chỉ ordering nội bộ gọi).
 */
public record CodCaptureRequest(
    @NotBlank String orderId,
    @Positive long amountVnd,
    @NotBlank String idempotencyKey) {
}
