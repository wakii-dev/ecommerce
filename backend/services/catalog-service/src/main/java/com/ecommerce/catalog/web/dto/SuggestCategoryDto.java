package com.ecommerce.catalog.web.dto;

/**
 * Item gợi ý danh mục — contract: {@code {slug, name}} (đã resolve theo locale).
 */
public record SuggestCategoryDto(String slug, String name) {
}
