package com.ecommerce.catalog.reviews.web.dto;

import java.util.List;
import java.util.Map;

/**
 * ReviewList — khớp contract: {items, breakdown, total}. Breakdown key
 * "5".."1" LUÔN đủ (fill 0 — spec Q5); pagination qua query params, total
 * dùng cho FE tính trang.
 */
public record ReviewListDto(
    List<ReviewDto> items,
    Map<String, Long> breakdown,
    long total
) {
}
