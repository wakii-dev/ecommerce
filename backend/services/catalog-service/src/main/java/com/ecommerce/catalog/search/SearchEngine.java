package com.ecommerce.catalog.search;

import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.SuggestResponseDto;

/**
 * SearchEngine seam (D15): ES chính (EsEngine — Task 5/6), PostgreSQL FTS
 * fallback ({@link PgFtsEngine}). Chọn lúc startup qua
 * {@link SearchEngineConfig}; degraded (ES down) KHÔNG 500 — luôn còn PgFts.
 *
 * <p>{@code index/delete/reindexAll} chỉ có nghĩa với EsEngine — PgFtsEngine
 * no-op (search_vec GENERATED tự động theo row).</p>
 */
public interface SearchEngine {

    /** Full-text search + filters/sort/pagination — trả page chuẩn contract. */
    ProductCardPageDto search(SearchQuery query);

    /** Search-as-you-type: ≤5 products + ≤5 categories {slug, name}. */
    SuggestResponseDto suggest(String q, String locale);

    /**
     * SF-13 (FI-323) A6b — sản phẩm tương tự cho PDP (runtime endpoint, ADR
     * 0005: NGOÀI catalog.yaml freeze). ES more_like_this; PgFts fallback =
     * cùng category mới nhất. Slug không tồn tại → page RỖNG (200 — PDP ẩn).
     */
    ProductCardPageDto related(String slug, String locale, int size);

    /** Đẩy 1 product lên index (EsEngine) — gọi sau admin write. */
    void index(ProductEntity product);

    /** Xóa doc khỏi index (EsEngine). */
    void delete(String productId);

    /** Reindex toàn bộ published (EsEngine) — gọi sau seed (§5.9). */
    void reindexAll();

    /** Tên engine (log/telemetry): "es" | "pg-fts". */
    String name();
}
