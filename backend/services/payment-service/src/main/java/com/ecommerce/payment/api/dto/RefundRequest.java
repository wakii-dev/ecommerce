package com.ecommerce.payment.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * Body POST /payment/refunds — contract `RefundRequest`: paymentIntentId + reason
 * bắt buộc; amount bỏ trống = refund toàn bộ; @Positive → 400 (không rơi 409 gây
 * hiểu nhầm ở service).
 */
public record RefundRequest(
    @NotBlank String paymentIntentId,
    @Positive Long amount,
    @NotBlank String reason
) {
}
