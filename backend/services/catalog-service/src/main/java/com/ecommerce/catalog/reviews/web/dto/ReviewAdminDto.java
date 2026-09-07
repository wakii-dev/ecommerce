package com.ecommerce.catalog.reviews.web.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * ReviewAdmin — khớp contract allOf(Review + {productId, status}).
 * Ghép từ ReviewEntity ở ReviewService (dto không import entity — pattern SF-4).
 */
public record ReviewAdminDto(
    UUID id,
    UUID userId,
    String userName,
    int rating,
    String title,
    String content,
    boolean verifiedPurchase,
    Instant createdAt,
    UUID productId,
    String status
) {
}
