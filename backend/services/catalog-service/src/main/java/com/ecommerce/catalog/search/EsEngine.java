package com.ecommerce.catalog.search;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.apache.http.entity.ContentType;
import org.apache.http.nio.entity.NStringEntity;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.service.CatalogQueryService;
import com.ecommerce.catalog.service.LocaleResolver;
import com.ecommerce.catalog.web.dto.ProductCardDto;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.SuggestResponseDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * SearchEngine chính trên Elasticsearch (plan Task 5/6, spec Q3/Q16): raw JSON
 * query DSL qua Jackson trên low-level RestClient — không typed client, không
 * Spring Data ES.
 *
 * <p>Search: {@code multi_match} trên {@code name.{locale}^3, description.{locale}}
 * (operator AND, fuzziness AUTO); 0 hit → retry field {@code .vi} (fallback vi,
 * pack D15). Sort map khớp listProducts — discount sort trên field index-time
 * {@code discount} (Q9). Hit chỉ là ids — hydrate ProductCard từ PG qua
 * {@link CatalogQueryService#toCard} GIỮ đúng thứ tự score ES (PG là nguồn sự
 * thật giá/ảnh/slug resolve locale).</p>
 *
 * <p><strong>Runtime degradation (Q16):</strong> mọi ES call bọc try — fail →
 * flag degraded (WARN đúng 1 lần/đợt) + delegate {@link PgFtsEngine}, không bao
 * giờ 500. Call đầu thành công sau degraded → INFO + fire async
 * {@code reindexAll()} ĐÚNG 1 lần (AtomicBoolean guard) — index không stale
 * kéo dài tới restart.</p>
 */
public class EsEngine implements SearchEngine {

    private static final Logger log = LoggerFactory.getLogger(EsEngine.class);

    private final RestClient restClient;
    private final ObjectMapper mapper;
    private final PgFtsEngine fallback;
    private final ProductRepository products;
    private final ProductImageRepository images;
    private final CategoryRepository categories;
    private final NamedParameterJdbcTemplate jdbc;

    /** volatile — volatile-read mỗi call, ghi transition hiếm. */
    private volatile boolean degraded = false;
    private final AtomicBoolean healReindexQueued = new AtomicBoolean(false);

    EsEngine(RestClient restClient, ObjectMapper mapper, PgFtsEngine fallback,
             ProductRepository products, ProductImageRepository images,
             CategoryRepository categories, NamedParameterJdbcTemplate jdbc) {
        this.restClient = restClient;
        this.mapper = mapper;
        this.fallback = fallback;
        this.products = products;
        this.images = images;
        this.categories = categories;
        this.jdbc = jdbc;
    }

    /** Spring inferred destroy method cho @Bean — giải phóng connection pool. */
    public void close() {
        try {
            restClient.close();
        } catch (Exception e) {
            log.debug("[es] close client lỗi (shutdown): {}", e.getMessage());
        }
    }

    @Override
    public String name() {
        return "es";
    }

    // ── search / suggest (Task 6) ────────────────────────────────────────────

    @Override
    public ProductCardPageDto search(SearchQuery query) {
        try {
            ProductCardPageDto result = esSearch(query);
            markHealthyAgain();
            return result;
        } catch (Exception e) {
            return degrade("search", e, () -> fallback.search(query));
        }
    }

    @Override
    public SuggestResponseDto suggest(String q, String locale) {
        try {
            SuggestResponseDto result = esSuggest(q, locale);
            markHealthyAgain();
            return result;
        } catch (Exception e) {
            return degrade("suggest", e, () -> fallback.suggest(q, locale));
        }
    }

    private ProductCardPageDto esSearch(SearchQuery query) throws IOException {
        String q = query.q() == null ? "" : query.q().trim();
        if (q.isEmpty()) {
            return new ProductCardPageDto(List.of(), query.page(), query.size(), 0);
        }
        String key = LocaleResolver.EN.equals(query.locale()) ? "en" : "vi";
        ArrayNode filters = filters(query);
        JsonNode resp = runSearch(q, key, filters, query);
        ArrayNode hits = hits(resp);
        if (hits.isEmpty() && !"vi".equals(key)) {
            // 0 hit locale en → retry field vi (fallback vi — pack D15)
            resp = runSearch(q, "vi", filters, query);
            hits = hits(resp);
        }
        long total = resp.path("hits").path("total").path("value").asLong(0);
        return new ProductCardPageDto(
            hydrateCards(idsFromHits(hits), query.locale()), query.page(), query.size(), total);
    }

    private JsonNode runSearch(String q, String key, ArrayNode filters, SearchQuery query) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("track_total_hits", true);
        body.put("from", (long) (query.page() - 1) * query.size());
        body.put("size", query.size());
        ObjectNode multiMatch = body.putObject("query").putObject("bool").putArray("must")
            .addObject().putObject("multi_match");
        multiMatch.put("query", q);
        multiMatch.putArray("fields").add("name." + key + "^3").add("description." + key);
        multiMatch.put("operator", "and");
        multiMatch.put("fuzziness", "AUTO");
        if (!filters.isEmpty()) {
            body.withObjectProperty("query").withObjectProperty("bool")
                .set("filter", filters);
        }
        body.set("sort", sorts(query.sort()));
        return execute("POST", "/" + EsIndexConfig.INDEX + "/_search", body);
    }

    /** Filters dùng chung 2 lần thử (locale + fallback vi). */
    private ArrayNode filters(SearchQuery query) {
        ArrayNode filters = mapper.createArrayNode();
        if (query.categorySlug() != null && !query.categorySlug().isBlank()) {
            filters.addObject().putObject("term").put("categorySlugs", query.categorySlug().trim());
        }
        if (query.official() != null) {
            filters.addObject().putObject("term").put("official", query.official().booleanValue());
        }
        if (query.minPrice() != null || query.maxPrice() != null) {
            ObjectNode range = filters.addObject().putObject("range").putObject("price");
            if (query.minPrice() != null) {
                range.put("gte", query.minPrice());
            }
            if (query.maxPrice() != null) {
                range.put("lte", query.maxPrice());
            }
        }
        if (query.minRating() != null) {
            filters.addObject().putObject("range").putObject("ratingAvg").put("gte", query.minRating());
        }
        if (query.brand() != null && !query.brand().isBlank()) {
            // keyword — case_insensitive cho parity lower() của PgFtsEngine
            filters.addObject().putObject("term")
                .putObject("brand").put("value", query.brand().trim()).put("case_insensitive", true);
        }
        return filters;
    }

    /** Sort map (plan Task 6 + Q9): discount sort field index-time; createdAt asc tiebreak ổn định trang. */
    private ArrayNode sorts(String sort) {
        String sortKey = (sort == null || sort.isBlank()) ? "newest" : sort.trim();
        ArrayNode sorts = mapper.createArrayNode();
        switch (sortKey) {
            case "price_asc" -> {
                sorts.addObject().putObject("price").put("order", "asc");
                sorts.addObject().putObject("createdAt").put("order", "asc");
            }
            case "price_desc" -> {
                sorts.addObject().putObject("price").put("order", "desc");
                sorts.addObject().putObject("createdAt").put("order", "asc");
            }
            case "rating" -> {
                sorts.addObject().putObject("ratingAvg").put("order", "desc");
                sorts.addObject().putObject("ratingCount").put("order", "desc");
            }
            case "discount" -> sorts.addObject().putObject("discount").put("order", "desc");
            default -> sorts.addObject().putObject("createdAt").put("order", "desc"); // newest + default
        }
        return sorts;
    }

    private SuggestResponseDto esSuggest(String q, String locale) throws IOException {
        String term = q == null ? "" : q.trim();
        if (term.isEmpty()) {
            return new SuggestResponseDto(List.of(), List.of());
        }
        String key = LocaleResolver.EN.equals(locale) ? "en" : "vi";
        ObjectNode body = mapper.createObjectNode();
        body.put("size", 5);
        ObjectNode bool = body.putObject("query").putObject("bool");
        bool.putArray("must").addObject().putObject("match_phrase_prefix")
            .putObject("name." + key).put("query", term);
        bool.putArray("filter").addObject().putObject("term").put("status", ProductStatus.PUBLISHED.name());
        JsonNode resp = execute("POST", "/" + EsIndexConfig.INDEX + "/_search", body);
        List<ProductCardDto> cards = hydrateCards(idsFromHits(hits(resp)), locale);
        // Categories: cùng ilike PG (nguồn category là PG — extract helper PgFtsEngine dùng chung)
        return new SuggestResponseDto(cards,
            PgFtsEngine.suggestCategories(jdbc, mapper, term, locale));
    }

    // ── indexer ops (Task 5) — best-effort, KHÔNG ném ra call sites ──────────

    @Override
    public void index(ProductEntity product) {
        try {
            ObjectNode doc = mapper.valueToTree(ProductIndexer.buildDoc(product,
                images.findByProductIdOrderByPositionAsc(product.getId()), categoryMap()));
            // refresh=wait_for — doc thấy ngay cho test/E2E; ES tự refresh ~1s
            execute("PUT", "/" + EsIndexConfig.INDEX + "/_doc/" + product.getId() + "?refresh=wait_for", doc);
        } catch (Exception e) {
            log.error("[es] index({}) lỗi — best-effort (reindex sẽ heal)", product.getId(), e);
        }
    }

    @Override
    public void delete(String productId) {
        try {
            execute("DELETE", "/" + EsIndexConfig.INDEX + "/_doc/" + productId + "?refresh=wait_for", null);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() != 404) {
                log.error("[es] delete({}) lỗi — best-effort", productId, e);
            }
        } catch (Exception e) {
            log.error("[es] delete({}) lỗi — best-effort (reindex sẽ heal)", productId, e);
        }
    }

    /**
     * Làm rỗng index (delete_by_query match_all) + bulk toàn bộ PUBLISHED chưa
     * soft-delete (khớp điều kiện {@code ProductSpecs.published()}). KHÔNG
     * drop/recreate index: DELETE + PUT cùng tên ngay lập tức có race —
     * {@code _refresh} 404 "no such index" ngay sau create-ack (đã gặp thật).
     * delete_by_query refresh=true → xóa visible trước khi bulk → _count sau
     * reindex == đúng số PUBLISHED. SWALLOW mọi exception — call sites:
     * SeedDataRunner, StartupReindexRunner, heal sau degraded — KHÔNG được làm
     * crash startup/seed khi ES chết (D15, review P2 group 3).
     */
    @Override
    public void reindexAll() {
        try {
            EsIndexConfig.ensureIndex(restClient);
            ObjectNode wipeBody = mapper.createObjectNode();
            wipeBody.putObject("query").putObject("match_all"); // root giữ "query" — putObject trả CHILD node
            Request wipe = new Request("POST",
                "/" + EsIndexConfig.INDEX + "/_delete_by_query?conflicts=proceed&refresh=true");
            wipe.setJsonEntity(mapper.writeValueAsString(wipeBody));
            restClient.performRequest(wipe);
            List<ProductEntity> published = products.findAll().stream()
                .filter(p -> p.getStatus() == ProductStatus.PUBLISHED && p.getDeletedAt() == null)
                .toList();
            Map<UUID, com.ecommerce.catalog.domain.CategoryEntity> cats = categoryMap();
            Map<UUID, List<ProductImageEntity>> imagesByProduct = published.isEmpty() ? Map.of()
                : images.findByProductIdInOrderByPositionAsc(published.stream().map(ProductEntity::getId).toList())
                    .stream().collect(Collectors.groupingBy(ProductImageEntity::getProductId));
            StringBuilder ndjson = new StringBuilder();
            for (ProductEntity p : published) {
                ndjson.append("{\"index\": {\"_index\": \"").append(EsIndexConfig.INDEX)
                    .append("\", \"_id\": \"").append(p.getId()).append("\"}}\n");
                ndjson.append(mapper.writeValueAsString(
                        ProductIndexer.buildDoc(p, imagesByProduct.getOrDefault(p.getId(), List.of()), cats)))
                    .append('\n');
            }
            if (ndjson.length() > 0) {
                Request bulk = new Request("POST", "/_bulk");
                bulk.setEntity(new NStringEntity(ndjson.toString(),
                    ContentType.create("application/x-ndjson", java.nio.charset.StandardCharsets.UTF_8)));
                restClient.performRequest(bulk);
            }
            restClient.performRequest(new Request("POST", "/" + EsIndexConfig.INDEX + "/_refresh"));
            log.info("[es] reindexAll: {} docs (engine=es)", published.size());
        } catch (Exception e) {
            log.error("[es] reindexAll lỗi — index có thể stale (event/startup reindex sẽ heal)", e);
        }
    }

    // ── degradation (Q16) ────────────────────────────────────────────────────

    private <T> T degrade(String op, Exception e, Supplier<T> fallbackCall) {
        if (!degraded) {
            degraded = true;
            log.warn("[es] {} lỗi → degraded → PgFts fallback (không 500)", op, e);
        } else {
            log.debug("[es] {} lỗi (đã degraded) → PgFts fallback", op);
        }
        return fallbackCall.get();
    }

    /** Call ES thành công sau degraded → phục hồi flag + heal reindex 1 lần. */
    private void markHealthyAgain() {
        if (!degraded) {
            return;
        }
        degraded = false;
        log.info("[es] hoạt động trở lại sau degraded");
        if (healReindexQueued.compareAndSet(false, true)) {
            CompletableFuture.runAsync(() -> {
                try {
                    log.info("[es] heal: reindexAll async sau downtime (Q16)");
                    reindexAll();
                } catch (Exception e) {
                    log.error("[es] heal reindex lỗi", e);
                }
            });
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private JsonNode execute(String method, String endpoint, JsonNode body) throws IOException {
        Request request = new Request(method, endpoint);
        if (body != null) {
            request.setJsonEntity(mapper.writeValueAsString(body));
        }
        return mapper.readTree(restClient.performRequest(request).getEntity().getContent());
    }

    private ArrayNode hits(JsonNode response) {
        JsonNode hits = response.path("hits").path("hits");
        return hits instanceof ArrayNode array ? array : mapper.createArrayNode(); // defensive — shape lạ
    }

    private List<UUID> idsFromHits(ArrayNode hits) {
        return java.util.stream.StreamSupport.stream(hits.spliterator(), false)
            .map(hit -> hit.path("_id").asText(null))
            .filter(Objects::nonNull)
            .map(id -> {
                try {
                    return UUID.fromString(id);
                } catch (IllegalArgumentException bad) {
                    return null;
                }
            })
            .filter(Objects::nonNull)
            .toList();
    }

    /** Hydrate ProductCard từ PG theo ids, GIỮ đúng thứ tự score/sort ES. */
    private List<ProductCardDto> hydrateCards(List<UUID> ids, String locale) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<UUID, ProductEntity> byId = products.findAllById(ids).stream()
            .collect(Collectors.toMap(ProductEntity::getId, Function.identity()));
        Map<UUID, List<ProductImageEntity>> imagesByProduct = images.findByProductIdInOrderByPositionAsc(ids)
            .stream().collect(Collectors.groupingBy(ProductImageEntity::getProductId));
        return ids.stream()
            .map(byId::get)
            .filter(Objects::nonNull)
            .map(p -> CatalogQueryService.toCard(p, imagesByProduct.getOrDefault(p.getId(), List.of()), locale))
            .toList();
    }

    private Map<UUID, com.ecommerce.catalog.domain.CategoryEntity> categoryMap() {
        return categories.findAll().stream()
            .collect(Collectors.toMap(c -> c.getId(), Function.identity()));
    }
}
