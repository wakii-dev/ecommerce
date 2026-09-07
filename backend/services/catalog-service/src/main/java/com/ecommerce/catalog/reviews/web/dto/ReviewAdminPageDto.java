package com.ecommerce.catalog.reviews.web.dto;

import java.util.List;

/** ReviewAdminPage — khớp contract {items, page, size, total}, page 1-based. */
public record ReviewAdminPageDto(List<ReviewAdminDto> items, int page, int size, long total) {
}
