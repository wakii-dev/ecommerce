package com.ecommerce.catalog.reviews.web.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Review — khớp contract {@code Review} (catalog.yaml): required
 * [id, userId, userName, rating, content, verifiedPurchase, createdAt];
 * title optional. UGC không i18n (D17).
 */
public record ReviewDto(
    UUID id,
    UUID userId,
    String userName,
    int rating,
    String title,
    String content,
    boolean verifiedPurchase,
    Instant createdAt
) {
}
