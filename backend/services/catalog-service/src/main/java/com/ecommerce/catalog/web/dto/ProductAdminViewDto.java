package com.ecommerce.catalog.web.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.ecommerce.catalog.domain.I18nText;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * View admin chi tiết — contract {@code ProductAdminView} = allOf ProductDetail +
 * {status, nameI18n, descriptionI18n, seoTitleI18n?, seoDescriptionI18n?, slugVi}
 * (trả i18n GỐC để admin console edit — không resolve).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductAdminViewDto(
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
        List<ProductImageDto> images,
        List<VariantDto> variants,
        int relatedCount,
        String status,
        I18nText nameI18n,
        I18nText descriptionI18n,
        I18nText seoTitleI18n,
        I18nText seoDescriptionI18n,
        String slugVi) {
}
