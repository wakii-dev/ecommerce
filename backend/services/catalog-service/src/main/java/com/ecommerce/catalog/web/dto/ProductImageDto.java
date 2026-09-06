package com.ecommerce.catalog.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Ảnh gallery PDP — khớp contract {@code ProductImage}, sort theo position.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductImageDto(String url, String alt, int position) {
}
