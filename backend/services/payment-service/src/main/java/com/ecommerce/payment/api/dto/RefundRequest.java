package com.ecommerce.payment.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Body POST /payment/refunds — contract `RefundRequest`: paymentIntentId + reason
 * bắt buộc; amount bỏ trống = refund toàn bộ.
 */
public record RefundRequest(
    @NotBlank String paymentIntentId,
    Long amount,
    @NotBlank String reason
) {
}
