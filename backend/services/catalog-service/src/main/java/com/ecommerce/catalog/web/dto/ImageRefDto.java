package com.ecommerce.catalog.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Ảnh đại diện ProductCard — khớp contract {@code ImageRef}.
 * Không có ảnh → {@code url: ""} + {@code alt} = tên product (plan Task 3).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ImageRefDto(String url, String alt) {
}
