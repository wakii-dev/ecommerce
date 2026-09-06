package com.ecommerce.catalog.web.dto;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Node cây danh mục — khớp contract {@code Category}: name/slug resolved,
 * {@code slugEn} luôn trả, children đệ quy (roots có parentId null → bị bỏ
 * bởi NON_NULL — khớp "null = node gốc", thống nhất chính sách omitted-null).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CategoryDto(
        UUID id,
        String slug,
        String slugEn,
        String name,
        UUID parentId,
        List<CategoryDto> children) {
}
