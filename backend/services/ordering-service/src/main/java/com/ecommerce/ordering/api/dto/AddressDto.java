package com.ecommerce.ordering.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Địa chỉ — khớp contract Address (fullName/phone/line1/ward/district/city
 * bắt buộc; postalCode optional). Mirror domain record để không lộ entity.
 */
public record AddressDto(
    @NotBlank String fullName,
    @NotBlank String phone,
    @NotBlank String line1,
    @NotBlank String ward,
    @NotBlank String district,
    @NotBlank String city,
    String postalCode
) {
}
