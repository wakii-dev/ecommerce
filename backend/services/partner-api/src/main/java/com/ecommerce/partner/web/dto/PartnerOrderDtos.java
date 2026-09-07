package com.ecommerce.partner.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/**
 * Shape POST/GET orders — MIRROR contracts/openapi/partner-api.yaml (frozen).
 * camelCase theo contract (context pack ghi snake_case — CONTRACT THẮNG).
 * variantId: contract để optional nhưng ordering bắt buộc variant-level
 * (§6.1.4) → partner-api yêu cầu sớm để 400 rõ ràng (docs portal pin).
 */
public final class PartnerOrderDtos {

    private PartnerOrderDtos() {
    }

    public record PartnerCustomer(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 32) String phone,
        @Email @Size(max = 255) String email,
        @NotBlank @Size(max = 512) String address
    ) {
    }

    public record PartnerOrderItem(
        @NotNull String productId,
        @NotBlank String variantId,
        @Positive int qty
    ) {
    }

    public record CreatePartnerOrderRequest(
        @NotBlank @Size(max = 128) String partnerRef,
        @NotNull @Valid PartnerCustomer customer,
        @NotEmpty @Size(max = 50) @Valid List<PartnerOrderItem> items
    ) {
    }

    /** 201 body — contract PartnerOrderCreated (KHÔNG có clientSecret — frozen). */
    public record PartnerOrderCreated(
        String orderId,
        String partnerRef,
        String status
    ) {
    }

    /** GET body — contract PartnerOrder. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PartnerOrder(
        String orderId,
        String partnerRef,
        String status,
        List<PartnerOrderLine> items,
        Instant updatedAt
    ) {
    }

    public record PartnerOrderLine(
        String productId,
        String variantId,
        String name,
        int qty,
        long unitPrice
    ) {
    }
}
