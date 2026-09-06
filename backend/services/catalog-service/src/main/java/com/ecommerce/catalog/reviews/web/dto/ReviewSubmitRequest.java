package com.ecommerce.catalog.reviews.web.dto;

/**
 * ReviewSubmitRequest — khớp contract: required [rating, content]; title
 * optional. Validate ở service (pattern AdminCatalogService.validate — 400
 * qua ResponseStatusException, không bean-validation để giữ 1 kiểu lỗi).
 */
public record ReviewSubmitRequest(
    Integer rating,
    String title,
    String content
) {
}
