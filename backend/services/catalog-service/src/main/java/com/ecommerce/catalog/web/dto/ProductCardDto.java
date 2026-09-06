package com.ecommerce.catalog.web.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Card product (PLP/home) — khớp contract {@code ProductCard}.
 * Trường i18n (slug/name) ĐÃ resolve theo locale; các field optional
 * (brand/comparePrice/discountPercent/flashSaleEndsAt) vắng mặt khi không có
 * (@JsonInclude NON_NULL — thống nhất mọi DTO).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductCardDto(
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
        UUID categoryId) {
}
