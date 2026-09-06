package com.ecommerce.catalog.reviews.web.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * MeReview — ADDITIVE ngoài contract (REQUIREMENT-GAP FI-310, spec Q1):
 * review của tôi + trạng thái moderation + tên product (resolve vi) cho
 * trang my-reviews trong mfe-account.
 */
public record MeReviewDto(
    UUID id,
    UUID productId,
    String productName,
    int rating,
    String title,
    String content,
    String status,
    boolean verifiedPurchase,
    Instant createdAt
) {
}
