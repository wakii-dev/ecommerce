package com.ecommerce.catalog.web.dto;

import java.util.List;

/**
 * Page chuẩn contract {@code ProductCardPage} — {@code page} 1-based.
 */
public record ProductCardPageDto(List<ProductCardDto> items, int page, int size, long total) {
}
