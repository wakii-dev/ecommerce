package com.ecommerce.catalog.reviews.web.dto;

import java.util.List;

/** MeReviewPage — ADDITIVE ngoài contract (REQUIREMENT-GAP FI-310, spec Q1). Page 1-based. */
public record MeReviewPageDto(List<MeReviewDto> items, int page, int size, long total) {
}
