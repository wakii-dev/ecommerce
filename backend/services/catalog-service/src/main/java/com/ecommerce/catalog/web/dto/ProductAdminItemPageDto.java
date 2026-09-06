package com.ecommerce.catalog.web.dto;

import java.util.List;

/**
 * Trang list admin — contract {@code ProductAdminItemPage} (page 1-based).
 */
public record ProductAdminItemPageDto(List<ProductAdminItemDto> items, int page, int size, long total) {
}
