package com.ecommerce.catalog.web.dto;

import java.util.UUID;

import com.ecommerce.catalog.domain.I18nText;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Admin write category — khớp contract {@code CategoryWrite}
 * ({@code parentId} null = tạo danh mục gốc). i18n record domain {@code I18nText}
 * (vi bắt buộc, en optional — Q5b).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CategoryWriteDto(I18nText nameI18n, String slugVi, String slugEn, UUID parentId) {
}
