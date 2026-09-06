package com.ecommerce.catalog.web.dto;

import java.util.List;
import java.util.UUID;

import com.ecommerce.catalog.domain.I18nText;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Danh mục view admin — contract {@code CategoryAdmin} = allOf Category +
 * {nameI18n, slugVi} → JSON phẳng, children đệ quy.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CategoryAdminDto(
        UUID id,
        String slug,
        String slugEn,
        String name,
        UUID parentId,
        List<CategoryAdminDto> children,
        I18nText nameI18n,
        String slugVi) {
}
