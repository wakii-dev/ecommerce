package com.ecommerce.catalog.web.dto;

import java.util.Map;
import java.util.UUID;

import com.ecommerce.catalog.domain.I18nText;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Biến thể PDP — khớp contract {@code Variant} (mapping đọc Q5c):
 * {@code priceDelta} = giá override − giá gốc (0 khi không override),
 * {@code stock} luôn 0 (inventory là SF-5).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record VariantDto(UUID id, String name, Map<String, String> options, long priceDelta, int stock,
        I18nText nameI18n) {
}
