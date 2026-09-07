package com.ecommerce.catalog.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import com.ecommerce.catalog.AbstractIntegrationTest;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.web.dto.ProductCardDto;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.SuggestCategoryDto;
import com.ecommerce.catalog.web.dto.SuggestResponseDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT PgFtsEngine (Task 4): FTS unaccent khớp CẢ query có dấu lẫn không dấu
 * (f_unaccent 2 phía, spec Q2), prefix term, draft không trả, filter category
 * descendant, sort giá, suggest trgm ≤5+5 (categories có entry), locale=en
 * vẫn chạy (PG-mode search cột vi — fallback vi-only theo pack D15; per-locale
 * là việc của EsEngine Task 6). Seed tối thiểu qua repository, seed runner TẮT
 * (base class) + uri ES rỗng → config chọn PgFts không ping.
 */
@TestPropertySource(properties = {
    "catalog.seed.enabled=false", // override base (inlined properties của subclass THAY base)
    "elasticsearch.uri=",
    // base inline bị thay → khai báo lại 2 default AMQP (Task 5)
    "outbox.relay.enabled=false",
    "spring.rabbitmq.listener.simple.auto-startup=false"
})
class PgFtsEngineTest extends AbstractIntegrationTest {

    @Autowired
    ProductRepository products;
    @Autowired
    CategoryRepository categories;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired
    SearchEngine searchEngine;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;

    CategoryEntity dienTu;
    CategoryEntity thoiTrang;
    ProductEntity xiaomi;  // "Điện Thoại Xiaomi Redmi 13C" — đích search chính
    ProductEntity iphone;  // match "dien thoai" + sort giá cao hơn
    ProductEntity ao;      // category khác — category filter phải loại
    ProductEntity draft;   // DRAFT — search + suggest không bao giờ trả

    @BeforeEach
    void seed() {
        products.deleteAll();
        jdbc.update("DELETE FROM categories WHERE parent_id IS NOT NULL");
        jdbc.update("DELETE FROM categories WHERE parent_id IS NULL");

        dienTu = category("Điện Tử", "Electronics", "dien-tu", "electronics", null);
        thoiTrang = category("Thời Trang", "Fashion", "thoi-trang", "fashion", null);

        xiaomi = product("Điện Thoại Xiaomi Redmi 13C", "Xiaomi Redmi 13C Phone",
            "dien-thoai-xiaomi-redmi-13c", "xiaomi-redmi-13c-phone",
            "Pin 5000mAh, màn hình 90Hz", "5000mAh battery, 90Hz display",
            "Xiaomi", dienTu.getId(), ProductStatus.PUBLISHED, 3_290_000L);
        iphone = product("Điện Thoại iPhone 15 Pro Max", "iPhone 15 Pro Max Phone",
            "dien-thoai-iphone-15-pro-max", "iphone-15-pro-max-phone",
            "Chip A17 Pro, titan", "A17 Pro chip, titanium",
            "Apple", dienTu.getId(), ProductStatus.PUBLISHED, 24_990_000L);
        ao = product("Áo Thun Nam Cotton", "Men Cotton T-Shirt",
            "ao-thun-nam-cotton", "men-cotton-t-shirt",
            "Cotton 100% thoáng mát", "100% breathable cotton",
            "Yody", thoiTrang.getId(), ProductStatus.PUBLISHED, 200_000L);
        draft = product("Điện Thoại Nháp", "Draft Phone",
            "dien-thoai-nhap", "draft-phone",
            "Chưa xuất bản", "Not published",
            "NoBrand", dienTu.getId(), ProductStatus.DRAFT, 999_000L);
    }

    // ── engine-level ─────────────────────────────────────────────────────────

    @Test
    void searchKhongDauKhopViProduct() {
        // "dien thoai" không dấu → f_unaccent 2 phía khớp "Điện Thoại..."
        ProductCardPageDto page = searchEngine.search(query("dien thoai", "vi", null, "newest"));
        assertThat(page.total()).isEqualTo(2);
        assertThat(slugs(page)).containsExactlyInAnyOrder("dien-thoai-xiaomi-redmi-13c", "dien-thoai-iphone-15-pro-max");
    }

    @Test
    void searchCoDauCungKhop() {
        // query có dấu — unaccent query side trong SQL (Q2)
        assertThat(slugs(searchEngine.search(query("điện thoại", "vi", null, "newest"))))
            .containsExactlyInAnyOrder("dien-thoai-xiaomi-redmi-13c", "dien-thoai-iphone-15-pro-max");
    }

    @Test
    void searchPrefixTerm() {
        // "điện" 1 term prefix "dien:*" — khớp cả 2 phone, KHÔNG áo/draft
        assertThat(slugs(searchEngine.search(query("điện", "vi", null, "newest")))).hasSize(2);
        // "xiaomi" chỉ xiaomi
        assertThat(slugs(searchEngine.search(query("xiaomi", "vi", null, "newest"))))
            .containsExactly("dien-thoai-xiaomi-redmi-13c");
    }

    @Test
    void related_fallbackCungCategory_loaiSelfVaDraft() {
        // SF-13 A6b (review G3 P1): PgFts fallback — cùng category (iphone),
        // KHÔNG self, KHÔNG category khác (áo), KHÔNG draft
        var related = searchEngine.related("dien-thoai-xiaomi-redmi-13c", "vi", 8);
        assertThat(related.items()).extracting(c -> c.slug())
            .contains("dien-thoai-iphone-15-pro-max")
            .doesNotContain("dien-thoai-xiaomi-redmi-13c")
            .doesNotContain("ao-thun-nam-cotton")
            .doesNotContain("dien-thoai-nhap");
        // slug lạ → rỗng 200
        assertThat(searchEngine.related("slug-khong-ton-tai", "vi", 8).total()).isEqualTo(0);
    }

    @Test
    void draftVaProductCategoryKhacKhongTra() {
        assertThat(slugs(searchEngine.search(query("dien thoai", "vi", null, "newest"))))
            .doesNotContain("dien-thoai-nhap", "ao-thun-nam-cotton");
        // draft vẫn match tsquery ("điện thoại nháp") — nhưng status DRAFT loại ở WHERE
        assertThat(slugs(searchEngine.search(query("nhap", "vi", null, "newest")))).isEmpty();
    }

    @Test
    void filterCategoryNarrowVaSlugLa() {
        assertThat(searchEngine.search(query("dien thoai", "vi", "dien-tu", "newest")).total()).isEqualTo(2);
        assertThat(searchEngine.search(query("dien thoai", "vi", "thoi-trang", "newest")).total()).isZero();
        assertThat(searchEngine.search(query("dien thoai", "vi", "fashion", "newest")).total()).isZero(); // slug en cùng node
        assertThat(searchEngine.search(query("dien thoai", "vi", "khong-ton-tai", "newest")).total()).isZero();
    }

    @Test
    void sortPriceAscVaDesc() {
        assertThat(slugs(searchEngine.search(query("dien thoai", "vi", null, "price_asc"))))
            .containsExactly("dien-thoai-xiaomi-redmi-13c", "dien-thoai-iphone-15-pro-max");
        assertThat(slugs(searchEngine.search(query("dien thoai", "vi", null, "price_desc"))))
            .containsExactly("dien-thoai-iphone-15-pro-max", "dien-thoai-xiaomi-redmi-13c");
    }

    @Test
    void searchKhongMatchVaQuerySymbol() {
        assertThat(searchEngine.search(query("zzzz-khong-co", "vi", null, "newest")).total()).isZero();
        // query chỉ ký tự đặc biệt → tsquery rỗng → NULLIF → 0 hit, KHÔNG 500
        assertThat(searchEngine.search(query("!!!&&", "vi", null, "newest")).total()).isZero();
        assertThat(searchEngine.search(query("   ", "vi", null, "newest")).total()).isZero();
    }

    @Test
    void localeEnVanSearchDuoc() {
        // PG-mode search CỘT vi (search_vec từ name->>'vi', pack D15 fallback vi-only)
        // — query "phone" tiếng Anh KHÔNG khớp; query không dấu vẫn khớp product vi.
        // Per-locale (match "Phone") là việc của EsEngine (Task 6). Content (slug/name)
        // vẫn resolve theo locale=en.
        ProductCardPageDto en = searchEngine.search(query("dien thoai", "en", null, "newest"));
        assertThat(en.total()).isEqualTo(2);
        assertThat(en.items()).extracting(ProductCardDto::slug)
            .containsExactlyInAnyOrder("xiaomi-redmi-13c-phone", "iphone-15-pro-max-phone");
        assertThat(en.items()).extracting(ProductCardDto::name)
            .containsExactlyInAnyOrder("Xiaomi Redmi 13C Phone", "iPhone 15 Pro Max Phone");
        assertThat(searchEngine.search(query("phone", "en", null, "newest")).total()).isZero();
    }

    @Test
    void suggestTraProductsVaCategories() {
        SuggestResponseDto vi = searchEngine.suggest("điện", "vi");
        assertThat(vi.products().size()).isLessThanOrEqualTo(5);
        assertThat(vi.products()).extracting(ProductCardDto::slug).contains("dien-thoai-xiaomi-redmi-13c");
        assertThat(vi.products()).extracting(ProductCardDto::slug).doesNotContain("dien-thoai-nhap"); // draft
        assertThat(vi.categories().size()).isLessThanOrEqualTo(5);
        assertThat(vi.categories()).contains(new SuggestCategoryDto("dien-tu", "Điện Tử"));

        // en: ilike trên CỘT en — term tiếng Việt "điện" không khớp "Electronics"
        assertThat(searchEngine.suggest("điện", "en").categories()).isEmpty();
        // term tiếng Anh khớp cột en, slug + name resolve theo locale
        assertThat(searchEngine.suggest("elect", "en").categories())
            .contains(new SuggestCategoryDto("electronics", "Electronics"));
    }

    @Test
    void suggestKhongMatchTraRong() {
        SuggestResponseDto empty = searchEngine.suggest("xyzzz-khong-co", "vi");
        assertThat(empty.products()).isEmpty();
        assertThat(empty.categories()).isEmpty();
    }

    @Test
    void configChonPgftsKhiUriRong() {
        assertThat(searchEngine.name()).isEqualTo("pg-fts");
    }

    // ── HTTP (controller wiring + 400) ───────────────────────────────────────

    @Test
    void httpSearchVaSuggest() throws Exception {
        JsonNode body = get("/api/catalog/search?q=dien+thoai");
        assertThat(body.get("total").asInt()).isEqualTo(2);
        assertThat(body.get("page").asInt()).isEqualTo(1);

        JsonNode suggest = get("/api/catalog/search/suggest?q=%C4%91i%E1%BB%87n");
        assertThat(suggest.get("products").size()).isLessThanOrEqualTo(5);
        assertThat(suggest.get("categories").size()).isLessThanOrEqualTo(5);
        assertThat(suggest.has("products")).isTrue();
        assertThat(suggest.has("categories")).isTrue();
    }

    @Test
    void httpParamLoiTra400ProblemJson() {
        for (String url : List.of(
            "/api/catalog/search", // thiếu q
            "/api/catalog/search?q=", // q rỗng
            "/api/catalog/search?q=x&sort=bogus",
            "/api/catalog/search?q=x&page=0",
            "/api/catalog/search?q=x&size=101",
            "/api/catalog/search/suggest")) {
            ResponseEntity<String> r = http.getForEntity(url, String.class);
            assertThat(r.getStatusCode().value()).as("url %s", url).isEqualTo(400);
            assertThat(r.getHeaders().getContentType().toString()).contains("application/problem+json");
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private SearchQuery query(String q, String locale, String categorySlug, String sort) {
        return new SearchQuery(q, locale, categorySlug, sort, null, null, null, null, null, 1, 20);
    }

    private static List<String> slugs(ProductCardPageDto page) {
        return page.items().stream().map(ProductCardDto::slug).toList();
    }

    private JsonNode get(String path) throws Exception {
        ResponseEntity<String> r = http.getForEntity(path, String.class);
        assertThat(r.getStatusCode().value()).as("GET %s → %s", path, r.getStatusCode()).isEqualTo(200);
        return om.readTree(r.getBody());
    }

    private CategoryEntity category(String vi, String en, String slugVi, String slugEn, java.util.UUID parent) {
        CategoryEntity c = new CategoryEntity();
        c.setName(new I18nText(vi, en));
        c.setSlugVi(slugVi);
        c.setSlugEn(slugEn);
        c.setParentId(parent);
        return categories.save(c);
    }

    private ProductEntity product(String nameVi, String nameEn, String slugVi, String slugEn,
                                  String descVi, String descEn, String brand, java.util.UUID categoryId,
                                  ProductStatus status, long price) {
        ProductEntity p = new ProductEntity();
        p.setName(new I18nText(nameVi, nameEn));
        p.setSlugVi(slugVi);
        p.setSlugEn(slugEn);
        p.setDescription(new I18nText(descVi, descEn));
        p.setBrand(brand);
        p.setCategoryId(categoryId);
        p.setStatus(status);
        p.setPrice(price);
        p.setRatingAvg(new BigDecimal("4.5"));
        p.setRatingCount(10);
        return products.save(p);
    }
}
