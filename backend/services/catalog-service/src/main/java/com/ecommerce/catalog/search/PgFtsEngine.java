package com.ecommerce.catalog.search;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.service.CatalogQueryService;
import com.ecommerce.catalog.service.LocaleResolver;
import com.ecommerce.catalog.web.dto.ProductCardDto;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.SuggestCategoryDto;
import com.ecommerce.catalog.web.dto.SuggestResponseDto;

/**
 * SearchEngine fallback trên PostgreSQL (D15, spec Q2): native query trên
 * {@code search_vec} GENERATED (to_tsvector 'simple' + f_unaccent name->>'vi',
 * V10) — query side unaccent bằng CÙNG {@code f_unaccent} trong SQL (KHÔNG
 * unaccent trong Java), mỗi term thành prefix {@code term:*} join AND.
 * Suggest: pg_trgm similarity trên name->>'vi' (GIN trgm V10) + categories ilike.
 *
 * <p>index/delete/reindexAll = no-op (search_vec sống theo row — GIN index tự
 * cập nhật). Filters/sort/pagination giống listProducts (Task 3); ProductCard
 * hydrate qua {@link CatalogQueryService#toCard} — KHÔNG nhân bản mapping.</p>
 */
public class PgFtsEngine implements SearchEngine {

    private static final Logger log = LoggerFactory.getLogger(PgFtsEngine.class);

    /**
     * Xây tsquery từ :q ngay trong SQL: split whitespace → per term
     * f_unaccent + strip ký tự ngoài [0-9A-Za-z_] (chống syntax error
     * to_tsquery) → {@code san:*} join ' & '. Term rỗng hết → string_agg NULL
     * → NULLIF → to_tsquery(NULL) = NULL → match 0 row (an toàn, không lỗi).
     */
    private static final String TSQUERY =
        "to_tsquery('simple', NULLIF(("
            + "SELECT string_agg(san || ':*', ' & ') "
            + "FROM (SELECT regexp_replace(f_unaccent(t), '[^0-9A-Za-z_]', '', 'g') AS san "
            + "      FROM unnest(regexp_split_to_array(:q, '\\s+')) AS t) terms "
            + "WHERE san <> ''), ''))";

    private static final String SELECT_IDS = "SELECT p.id FROM products p WHERE p.status = 'PUBLISHED' AND p.deleted_at IS NULL";
    private static final String SELECT_COUNT = "SELECT count(*) FROM products p WHERE p.status = 'PUBLISHED' AND p.deleted_at IS NULL";

    private final NamedParameterJdbcTemplate jdbc;
    private final ProductRepository productRepository;
    private final ProductImageRepository imageRepository;
    private final CategoryRepository categoryRepository;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public PgFtsEngine(NamedParameterJdbcTemplate jdbc, ProductRepository productRepository,
                       ProductImageRepository imageRepository, CategoryRepository categoryRepository,
                       com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.productRepository = productRepository;
        this.imageRepository = imageRepository;
        this.categoryRepository = categoryRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public ProductCardPageDto search(SearchQuery query) {
        String q = query.q() == null ? "" : query.q().trim();
        if (q.isEmpty()) {
            return new ProductCardPageDto(List.of(), query.page(), query.size(), 0);
        }
        StringBuilder where = new StringBuilder(" AND p.search_vec @@ " + TSQUERY);
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("q", q);

        if (query.categorySlug() != null && !query.categorySlug().isBlank()) {
            List<UUID> categoryIds = descendantIds(query.categorySlug().trim());
            if (categoryIds.isEmpty()) {
                return new ProductCardPageDto(List.of(), query.page(), query.size(), 0); // slug lạ → rỗng (khớp listProducts)
            }
            where.append(" AND p.category_id IN (:categoryIds)");
            params.addValue("categoryIds", categoryIds);
        }
        if (query.minPrice() != null) {
            where.append(" AND p.price >= :minPrice");
            params.addValue("minPrice", query.minPrice());
        }
        if (query.maxPrice() != null) {
            where.append(" AND p.price <= :maxPrice");
            params.addValue("maxPrice", query.maxPrice());
        }
        if (query.minRating() != null) {
            where.append(" AND p.rating_avg >= :minRating");
            params.addValue("minRating", query.minRating());
        }
        if (query.brand() != null && !query.brand().isBlank()) {
            where.append(" AND lower(p.brand) = lower(:brand)");
            params.addValue("brand", query.brand().trim());
        }
        if (query.official() != null) {
            where.append(" AND p.official = :official");
            params.addValue("official", query.official());
        }

        String sql = SELECT_IDS + where + " ORDER BY " + orderBy(query.sort())
            + " LIMIT :limit OFFSET :offset";
        params.addValue("limit", query.size());
        params.addValue("offset", (long) (query.page() - 1) * query.size());

        List<UUID> ids = jdbc.queryForList(sql, params, UUID.class);
        Long total = jdbc.queryForObject(SELECT_COUNT + where, params, Long.class);
        return new ProductCardPageDto(hydrateCards(ids, query.locale()), query.page(), query.size(),
            total == null ? 0 : total);
    }

    @Override
    @Transactional(readOnly = true)
    public SuggestResponseDto suggest(String q, String locale) {
        String term = q == null ? "" : q.trim();
        if (term.isEmpty()) {
            return new SuggestResponseDto(List.of(), List.of());
        }
        // Products: trgm similarity trên name->>'vi' (index trgm V10), chỉ published
        List<UUID> ids = jdbc.queryForList(
            "SELECT id FROM products "
                + "WHERE status = 'PUBLISHED' AND deleted_at IS NULL "
                + "AND similarity(name->>'vi', :q) > 0.1 "
                + "ORDER BY similarity(name->>'vi', :q) DESC LIMIT 5",
            Map.of("q", term), UUID.class);
        List<ProductCardDto> productCards = hydrateCards(ids, locale);

        return new SuggestResponseDto(productCards, suggestCategories(jdbc, objectMapper, term, locale));
    }

    /**
     * Categories ilike '%q%' trên key locale — slug + name resolve theo locale.
     * Static + dùng chung cho CẢ HAI engines (EsEngine suggest gọi — nguồn
     * category là PG, Task 6 không nhân bản query).
     */
    static List<SuggestCategoryDto> suggestCategories(NamedParameterJdbcTemplate jdbc,
                                                      com.fasterxml.jackson.databind.ObjectMapper objectMapper,
                                                      String term, String locale) {
        String key = LocaleResolver.EN.equals(locale) ? "en" : "vi";
        String pattern = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.query(
            "SELECT name, slug_vi, slug_en FROM categories "
                + "WHERE name->>:loc ILIKE :pattern ESCAPE '\\' ORDER BY created_at LIMIT 5",
            Map.of("loc", key, "pattern", pattern),
            (rs, i) -> {
                I18nText name = parseI18nStatic(rs.getString("name"), objectMapper);
                return new SuggestCategoryDto(resolvedSlug(rs.getString("slug_vi"), rs.getString("slug_en"), key),
                    name.resolve(locale));
            });
    }

    private static I18nText parseI18nStatic(String json, com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        try {
            return objectMapper.readValue(json, I18nText.class);
        } catch (Exception e) {
            return new I18nText(json, null);
        }
    }

    // ── no-op (PG: search_vec GENERATED sống theo row) ──────────────────────

    @Override
    public void index(ProductEntity product) {
        log.debug("[pg-fts] index({}) no-op — search_vec GENERATED tự động", product.getId());
    }

    @Override
    public void delete(String productId) {
        log.debug("[pg-fts] delete({}) no-op — search_vec GENERATED tự động", productId);
    }

    @Override
    public void reindexAll() {
        log.debug("[pg-fts] reindexAll() no-op — GIN index theo row, không cần reindex");
    }

    @Override
    public String name() {
        return "pg-fts";
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Hydrate ProductCard từ PG theo ids, GIỮ đúng thứ tự query (score/sort). */
    private List<ProductCardDto> hydrateCards(List<UUID> ids, String locale) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<UUID, ProductEntity> byId = productRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(ProductEntity::getId, Function.identity()));
        Map<UUID, List<ProductImageEntity>> imagesByProduct = imageRepository.findByProductIdInOrderByPositionAsc(ids)
            .stream()
            .collect(Collectors.groupingBy(ProductImageEntity::getProductId));
        return ids.stream()
            .map(byId::get)
            .filter(Objects::nonNull)
            .map(p -> CatalogQueryService.toCard(p, imagesByProduct.getOrDefault(p.getId(), List.of()), locale))
            .toList();
    }

    /** Sort map giống listProducts — discount dùng CÙNG biểu thức @Formula discountRate (Q9). */
    private static String orderBy(String sort) {
        String sortKey = (sort == null || sort.isBlank()) ? "newest" : sort.trim();
        return switch (sortKey) {
            case "price_asc" -> "p.price ASC, p.id ASC";
            case "price_desc" -> "p.price DESC, p.id ASC";
            case "rating" -> "p.rating_avg DESC, p.rating_count DESC, p.id ASC";
            case "discount" -> "CASE WHEN p.compare_price > p.price "
                + "THEN (p.compare_price - p.price)::float / p.compare_price ELSE 0 END DESC, p.id ASC";
            default -> "p.created_at DESC, p.id ASC"; // newest
        };
    }

    /** Danh mục gốc + descendants (replicate logic listProducts — filter cha phải thấy hàng con). */
    private List<UUID> descendantIds(String slug) {
        UUID rootId = categoryRepository.findBySlugViOrSlugEn(slug, slug)
            .map(CategoryEntity::getId)
            .orElse(null);
        if (rootId == null) {
            return List.of();
        }
        Map<UUID, List<CategoryEntity>> byParent = categoryRepository.findAll().stream()
            .filter(c -> c.getParentId() != null)
            .collect(Collectors.groupingBy(CategoryEntity::getParentId));
        List<UUID> ids = new ArrayList<>();
        Deque<UUID> stack = new ArrayDeque<>();
        stack.push(rootId);
        while (!stack.isEmpty()) {
            UUID current = stack.pop();
            ids.add(current);
            byParent.getOrDefault(current, List.of()).forEach(child -> stack.push(child.getId()));
        }
        return ids;
    }

    private static String resolvedSlug(String slugVi, String slugEn, String localeKey) {
        String preferred = "en".equals(localeKey) ? slugEn : slugVi;
        if (preferred != null && !preferred.isBlank()) {
            return preferred;
        }
        return slugVi != null ? slugVi : slugEn;
    }
}
