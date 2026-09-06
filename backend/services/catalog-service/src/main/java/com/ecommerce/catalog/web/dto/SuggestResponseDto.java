package com.ecommerce.catalog.web.dto;

import java.util.List;

/**
 * Khớp contract {@code SuggestResponse}: ≤5 products + ≤5 categories
 * {slug, name} — luôn trả cả hai mảng (rỗng khi không gợi ý).
 */
public record SuggestResponseDto(List<ProductCardDto> products, List<SuggestCategoryDto> categories) {
}
