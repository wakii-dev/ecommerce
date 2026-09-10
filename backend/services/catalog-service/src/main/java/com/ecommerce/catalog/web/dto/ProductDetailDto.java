package com.ecommerce.catalog.web.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Chi tiết PDP — contract {@code ProductDetail} = ProductCard + description/
 * images/variants/relatedCount (allOf → JSON phẳng, không lồng card).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductDetailDto(
        UUID id,
        String slug,
        String slugEn,
        String name,
        String brand,
        long price,
        Long comparePrice,
        Integer discountPercent,
        Instant flashSaleEndsAt,
        BigDecimal ratingAvg,
        int ratingCount,
        ImageRefDto image,
        List<String> tags,
        UUID categoryId,
        String description,
        String seoTitle,
        String seoDescription,
        List<ProductImageDto> images,
        List<VariantDto> variants,
        int relatedCount) {
}
