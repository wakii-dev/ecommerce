package com.ecommerce.catalog.web.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Item list admin — contract {@code ProductAdminItem} = allOf ProductCard +
 * {status, slugVi} → JSON PHẲNG (không lồng card).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductAdminItemDto(
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
        String status,
        String slugVi) {
}
