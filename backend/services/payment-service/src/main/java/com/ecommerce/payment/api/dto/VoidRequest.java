package com.ecommerce.payment.api.dto;

import jakarta.validation.constraints.NotBlank;

/** Body POST /payment/void — contract `VoidRequest`. */
public record VoidRequest(
    @NotBlank String paymentIntentId
) {
}
