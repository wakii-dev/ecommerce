package com.ecommerce.catalog.search;

import java.math.BigDecimal;
import java.util.Set;

/**
 * Tham số search dùng chung mọi engine (Task 4/6). Sort enum khớp contract
 * {@code searchProducts}; filters (price/rating/brand/official) dùng chung
 * listProducts — search HTTP chỉ bind q/category/sort (contract là LAW),
 * engine-level cho parity EsEngine (Task 6).
 *
 * <p>Page 1-based; size clamp [1, 100] (khác listProducts throw 400 — search
 * chọn clamp cho việc gọi nội bộ storefront an toàn).</p>
 */
public record SearchQuery(
        String q,
        String locale,
        String categorySlug,
        String sort,
        Long minPrice,
        Long maxPrice,
        BigDecimal minRating,
        String brand,
        Boolean official,
        int page,
        int size) {

    public static final Set<String> VALID_SORTS =
        Set.of("price_asc", "price_desc", "rating", "newest", "discount");

    public SearchQuery {
        page = Math.max(page, 1);
        size = Math.min(Math.max(size, 1), 100);
    }
}
