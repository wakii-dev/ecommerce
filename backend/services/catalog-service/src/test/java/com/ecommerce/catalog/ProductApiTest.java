package com.ecommerce.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;

import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ProductVariantEntity;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ProductVariantRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT public product APIs (Task 3 + Task 8): list filter/sort/pagination +
 * đầy đủ field ProductCard (compare/discount/flash/rating/official/tags/image),
 * PDP slug vi+en, variant priceDelta mapping Q5c, 404 draft, 400 param lỗi.
 */
class ProductApiTest extends AbstractIntegrationTest {

    @Autowired
    ProductRepository products;
    @Autowired
    CategoryRepository categories;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired
    ProductImageRepository images;
    @Autowired
    ProductVariantRepository variants;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;

    CategoryEntity dienTu;
    CategoryEntity thoiTrang;
    CategoryEntity phuKien;
    ProductEntity headphone; // compare 1tr/500k → discount 50, official, tags, 2 ảnh
    ProductEntity ao;        // flash tương lai, rating cao nhất
    ProductEntity sneaker;   // 2 variants + price override, official, 3 ảnh
    ProductEntity sach;      // ở category CON (phu-kien) — test filter gồm descendants
    ProductEntity den;       // không ảnh, không compare — field optional phải vắng
    ProductEntity draft;     // DRAFT — không list, detail 404

    @BeforeEach
    void seed() {
        variants.deleteAll();
        images.deleteAll();
        products.deleteAll();
        // Self-FK parent_id: xóa CON trước CHA (deleteAll không đảm bảo thứ tự)
        jdbc.update("DELETE FROM categories WHERE parent_id IS NOT NULL");
        jdbc.update("DELETE FROM categories WHERE parent_id IS NULL");

        dienTu = category("Điện Tử", "Electronics", "dien-tu", "electronics", null);
        thoiTrang = category("Thời Trang", "Fashion", "thoi-trang", "fashion", null);
        phuKien = category("Phụ Kiện", "Accessories", "phu-kien", "accessories", dienTu.getId());

        headphone = product("Tai Nghe Bluetooth", "Bluetooth Headset", "tai-nghe", "bluetooth-headset",
            "Âm thanh sống động, pin 40 giờ", "Immersive sound, 40h battery",
            "SoundMax", dienTu.getId(), ProductStatus.PUBLISHED, 500_000L, 1_000_000L, null,
            true, List.of("Chính hãng"), "4.5", 120);
        image(headphone, "https://img.ecom/tai-nghe-1.jpg", "Tai nghe bluetooth", 0);
        image(headphone, "https://img.ecom/tai-nghe-2.jpg", "Tai nghe góc 2", 1);

        ao = product("Áo Thun Nam", "Men T-Shirt", "ao-thun", "men-t-shirt",
            "Cotton thoáng mát", "Breathable cotton",
            "TeeWear", thoiTrang.getId(), ProductStatus.PUBLISHED, 200_000L, 250_000L,
            Instant.now().plus(Duration.ofDays(2)), false, List.of(), "4.8", 50);
        image(ao, "https://img.ecom/ao-thun.jpg", "Áo thun nam", 0);

        sneaker = product("Giày Sneaker", "Sneaker Shoes", "giay-sneaker", "sneaker-shoes",
            "Đế êm, đi cả ngày", "Soft sole, all-day comfort",
            "StepUp", thoiTrang.getId(), ProductStatus.PUBLISHED, 900_000L, 1_350_000L, null,
            true, List.of("Freeship"), "4.0", 300);
        image(sneaker, "https://img.ecom/giay-1.jpg", "Giày mặt trước", 0);
        image(sneaker, "https://img.ecom/giay-2.jpg", "Giày bên hông", 1);
        image(sneaker, "https://img.ecom/giay-3.jpg", "Giày đế", 2);
        variant(sneaker, "Đỏ / 40", "Red / 40", "40", "Đỏ", 1_000_000L); // override +100k
        variant(sneaker, null, null, "41", "Xanh", null);                // không override → delta 0, tên fallback

        sach = product("Sách Nhà Giả Kim", "The Alchemist Book", "sach-nha-gia-kim", "the-alchemist-book",
            "Tiểu thuyết nổi tiếng", "Famous novel",
            null, phuKien.getId(), ProductStatus.PUBLISHED, 120_000L, 200_000L, null,
            false, List.of("Hàng mới"), "3.9", 25);
        image(sach, "https://img.ecom/sach.jpg", "Bìa sách", 0);

        den = product("Đèn Bàn LED", "LED Desk Lamp", "den-ban", "led-desk-lamp",
            "Ánh sáng dịu", "Soft light",
            "HomeGlow", thoiTrang.getId(), ProductStatus.PUBLISHED, 50_000L, null, null,
            false, List.of(), "3.2", 10); // KHÔNG ảnh

        draft = product("Sản Phẩm Nháp", "Draft Item", "san-pham-nhap", "draft-item",
            "Chưa xuất bản", "Not published",
            "NoBrand", dienTu.getId(), ProductStatus.DRAFT, 999_000L, null, null,
            false, List.of(), "0.0", 0);
    }

    // ── list ─────────────────────────────────────────────────────────────────

    @Test
    void listDefaultTra5PublishedBoDraft() throws Exception {
        JsonNode body = get("/api/catalog/products");
        assertThat(body.get("page").asInt()).isEqualTo(1);
        assertThat(body.get("size").asInt()).isEqualTo(20);
        assertThat(body.get("total").asInt()).isEqualTo(5);
        List<String> slugs = slugs(body);
        assertThat(slugs).containsExactlyInAnyOrder("tai-nghe", "ao-thun", "giay-sneaker", "sach-nha-gia-kim", "den-ban");
    }

    @Test
    void locTheoDanhMucSlugViVaEnGomDescendants() throws Exception {
        // slug vi của danh mục — gồm cả product ở category con (sach ở phu-kien)
        assertThat(slugs(get("/api/catalog/products?category=dien-tu")))
            .containsExactlyInAnyOrder("tai-nghe", "sach-nha-gia-kim");
        // slug en cùng danh mục → cùng kết quả
        assertThat(slugs(get("/api/catalog/products?category=electronics")))
            .containsExactlyInAnyOrder("tai-nghe", "sach-nha-gia-kim");
        // category con
        assertThat(slugs(get("/api/catalog/products?category=phu-kien")))
            .containsExactly("sach-nha-gia-kim");
        // thoi-trang
        assertThat(slugs(get("/api/catalog/products?category=fashion")))
            .containsExactlyInAnyOrder("ao-thun", "giay-sneaker", "den-ban");
        // slug lạ → trang rỗng (không lỗi)
        JsonNode empty = get("/api/catalog/products?category=khong-ton-tai");
        assertThat(empty.get("total").asInt()).isZero();
        assertThat(empty.get("items").isEmpty()).isTrue();
    }

    @Test
    void locGiaRatingBrandOfficial() throws Exception {
        assertThat(slugs(get("/api/catalog/products?minPrice=200000&maxPrice=900000")))
            .containsExactlyInAnyOrder("ao-thun", "tai-nghe", "giay-sneaker");
        assertThat(slugs(get("/api/catalog/products?minRating=4")))
            .containsExactlyInAnyOrder("ao-thun", "tai-nghe", "giay-sneaker");
        assertThat(slugs(get("/api/catalog/products?brand=SoundMax"))).containsExactly("tai-nghe");
        // brand khớp không phân biệt hoa thường
        assertThat(slugs(get("/api/catalog/products?brand=soundmax"))).containsExactly("tai-nghe");
        // official (GAP FLAGGED — không có trong contract)
        assertThat(slugs(get("/api/catalog/products?official=true")))
            .containsExactlyInAnyOrder("tai-nghe", "giay-sneaker");
    }

    @Test
    void sortTungKieuTheoContract() throws Exception {
        assertThat(slugs(get("/api/catalog/products?sort=price_asc")))
            .containsExactly("den-ban", "sach-nha-gia-kim", "ao-thun", "tai-nghe", "giay-sneaker");
        assertThat(slugs(get("/api/catalog/products?sort=price_desc")))
            .containsExactly("giay-sneaker", "tai-nghe", "ao-thun", "sach-nha-gia-kim", "den-ban");
        // rating desc + ratingCount tiebreak
        assertThat(slugs(get("/api/catalog/products?sort=rating")))
            .containsExactly("ao-thun", "tai-nghe", "giay-sneaker", "sach-nha-gia-kim", "den-ban");
        // discount: (compare−price)/compare DESC — CASE WHEN compare > price ELSE 0 (Q9)
        assertThat(slugs(get("/api/catalog/products?sort=discount")))
            .containsExactly("tai-nghe", "sach-nha-gia-kim", "giay-sneaker", "ao-thun", "den-ban");
        // newest: createdAt DESC — so non-tăng theo giá trị DB thật (tránh flake tie)
        assertNewestSort();
    }

    @Test
    void phanTrangPage1Based() throws Exception {
        JsonNode page2 = get("/api/catalog/products?sort=price_asc&size=2&page=2");
        assertThat(page2.get("page").asInt()).isEqualTo(2);
        assertThat(page2.get("size").asInt()).isEqualTo(2);
        assertThat(page2.get("total").asInt()).isEqualTo(5);
        assertThat(slugs(page2)).containsExactly("ao-thun", "tai-nghe");
        JsonNode page3 = get("/api/catalog/products?sort=price_asc&size=2&page=3");
        assertThat(slugs(page3)).containsExactly("giay-sneaker");
    }

    // ── ProductCard fields (Task 8) ──────────────────────────────────────────

    @Test
    void cardFieldCompareDiscountFlashRatingOfficialTagsImage() throws Exception {
        JsonNode items = get("/api/catalog/products").get("items");
        Map<String, JsonNode> bySlug = StreamSupport.stream(items.spliterator(), false)
            .collect(Collectors.toMap(i -> i.get("slug").asText(), Function.identity()));

        JsonNode tai = bySlug.get("tai-nghe");
        assertThat(tai.get("id").asText()).isEqualTo(headphone.getId().toString());
        assertThat(tai.get("slugEn").asText()).isEqualTo("bluetooth-headset");
        assertThat(tai.get("name").asText()).isEqualTo("Tai Nghe Bluetooth");
        assertThat(tai.get("brand").asText()).isEqualTo("SoundMax");
        assertThat(tai.get("price").asLong()).isEqualTo(500_000L);
        assertThat(tai.get("comparePrice").asLong()).isEqualTo(1_000_000L);
        assertThat(tai.get("discountPercent").asInt()).isEqualTo(50);
        assertThat(tai.has("flashSaleEndsAt")).isFalse(); // không flash → vắng
        assertThat(tai.get("ratingAvg").asDouble()).isEqualTo(4.5);
        assertThat(tai.get("ratingCount").asInt()).isEqualTo(120);
        assertThat(tai.get("image").get("url").asText()).isEqualTo("https://img.ecom/tai-nghe-1.jpg"); // position 0
        assertThat(tai.get("tags").get(0).asText()).isEqualTo("Chính hãng");
        assertThat(UUID.fromString(tai.get("categoryId").asText())).isEqualTo(dienTu.getId());

        JsonNode giay = bySlug.get("giay-sneaker");
        assertThat(giay.get("discountPercent").asInt()).isEqualTo(33); // (1350−900)×100/1350 = 33.3 → floor 33

        JsonNode quyenSach = bySlug.get("sach-nha-gia-kim");
        assertThat(quyenSach.get("discountPercent").asInt()).isEqualTo(40);
        assertThat(quyenSach.has("brand")).isFalse(); // brand null → vắng (NON_NULL thống nhất)

        JsonNode denNode = bySlug.get("den-ban");
        assertThat(denNode.has("comparePrice")).isFalse(); // không compare → vắng
        assertThat(denNode.has("discountPercent")).isFalse();
        assertThat(denNode.has("flashSaleEndsAt")).isFalse();
        assertThat(denNode.get("image").get("url").asText()).isEmpty(); // không ảnh → url ""
        assertThat(denNode.get("image").get("alt").asText()).isEqualTo("Đèn Bàn LED"); // alt = tên
        assertThat(denNode.get("tags").isEmpty()).isTrue();

        JsonNode aoNode = bySlug.get("ao-thun");
        assertThat(aoNode.get("discountPercent").asInt()).isEqualTo(20);
        Instant flash = Instant.parse(aoNode.get("flashSaleEndsAt").asText()); // ISO-8601 UTC
        assertThat(flash).isAfter(Instant.now());
    }

    @Test
    void flashHetHanKhongTraFlashSaleEndsAt() throws Exception {
        product("Flash Hết Hạn", "Expired Flash", "flash-het-han", "expired-flash",
            "Flash đã qua", "Flash expired",
            "FlashBrand", thoiTrang.getId(), ProductStatus.PUBLISHED, 100_000L, 200_000L,
            Instant.now().minus(Duration.ofHours(1)), false, List.of(), "4.1", 8);

        JsonNode item = find(get("/api/catalog/products"), "flash-het-han");
        assertThat(item.has("flashSaleEndsAt")).isFalse(); // hết hạn → card render thường
        assertThat(item.get("comparePrice").asLong()).isEqualTo(200_000L); // compare vẫn trả
        assertThat(item.get("discountPercent").asInt()).isEqualTo(50);     // (200−100)×100/200
    }

    @Test
    void localeResolveTrenList() throws Exception {
        JsonNode en = get("/api/catalog/products?locale=en");
        JsonNode taiEn = find(en, "bluetooth-headset");
        assertThat(taiEn.get("name").asText()).isEqualTo("Bluetooth Headset");
        assertThat(taiEn.get("slug").asText()).isEqualTo("bluetooth-headset");
        assertThat(taiEn.get("slugEn").asText()).isEqualTo("bluetooth-headset");
        assertThat(taiEn.get("description")).isNull(); // list không có description

        // mặc định vi — slug resolve theo vi, slugEn vẫn trả
        JsonNode vi = get("/api/catalog/products");
        JsonNode taiVi = find(vi, "tai-nghe");
        assertThat(taiVi.get("name").asText()).isEqualTo("Tai Nghe Bluetooth");
        assertThat(taiVi.get("slugEn").asText()).isEqualTo("bluetooth-headset");
    }

    // ── PDP ──────────────────────────────────────────────────────────────────

    @Test
    void detailSlugViVaEnCungProduct() throws Exception {
        JsonNode vi = get("/api/catalog/products/tai-nghe");
        JsonNode en = get("/api/catalog/products/bluetooth-headset?locale=en");
        assertThat(vi.get("id").asText()).isEqualTo(en.get("id").asText());
        assertThat(vi.get("description").asText()).isEqualTo("Âm thanh sống động, pin 40 giờ");
        assertThat(en.get("description").asText()).isEqualTo("Immersive sound, 40h battery");
        assertThat(en.get("name").asText()).isEqualTo("Bluetooth Headset");
        assertThat(en.get("slug").asText()).isEqualTo("bluetooth-headset");
        // gallery sort theo position
        JsonNode gallery = vi.get("images");
        assertThat(gallery.size()).isEqualTo(2);
        assertThat(gallery.get(0).get("position").asInt()).isZero();
        assertThat(gallery.get(1).get("position").asInt()).isEqualTo(1);
        assertThat(vi.get("images").get(0).get("url").asText()).isEqualTo("https://img.ecom/tai-nghe-1.jpg");
        assertThat(vi.get("image").get("url").asText()).isEqualTo("https://img.ecom/tai-nghe-1.jpg");
        assertThat(vi.get("relatedCount").asInt()).isZero();
    }

    @Test
    void detailVariantMappingQ5c() throws Exception {
        JsonNode detail = get("/api/catalog/products/giay-sneaker");
        JsonNode variants = detail.get("variants");
        assertThat(variants.size()).isEqualTo(2);

        JsonNode do40 = variants.get(0);
        assertThat(do40.get("name").asText()).isEqualTo("Đỏ / 40"); // name_i18n resolve vi
        assertThat(do40.get("options").get("color").asText()).isEqualTo("Đỏ");
        assertThat(do40.get("options").get("size").asText()).isEqualTo("40");
        assertThat(do40.get("priceDelta").asLong()).isEqualTo(100_000L); // override 1tr − gốc 900k
        assertThat(do40.get("stock").asInt()).isZero();

        JsonNode xanh = variants.get(1);
        assertThat(xanh.get("name").asText()).isEqualTo("Xanh / 41"); // fallback join non-null
        assertThat(xanh.get("priceDelta").asLong()).isZero();          // không override → 0
        assertThat(xanh.get("stock").asInt()).isZero();

        // en: name_i18n resolve en; variant không name_i18n → fallback join RAW cột (Xanh không dịch)
        JsonNode en = get("/api/catalog/products/sneaker-shoes?locale=en");
        assertThat(en.get("variants").get(0).get("name").asText()).isEqualTo("Red / 40");
        assertThat(en.get("variants").get(1).get("name").asText()).isEqualTo("Xanh / 41");
    }

    @Test
    void detailDraftVaUnknownTra404ProblemJson() {
        ResponseEntity<String> draftVi = http.getForEntity("/api/catalog/products/san-pham-nhap", String.class);
        ResponseEntity<String> draftEn = http.getForEntity("/api/catalog/products/draft-item", String.class);
        ResponseEntity<String> unknown = http.getForEntity("/api/catalog/products/khong-ton-tai", String.class);
        for (ResponseEntity<String> r : List.of(draftVi, draftEn, unknown)) {
            assertThat(r.getStatusCode().value()).isEqualTo(404);
            assertThat(r.getHeaders().getContentType().toString()).contains("application/problem+json");
        }
    }

    @Test
    void softDeletedProductKhongListVaDetail404() throws Exception {
        ProductEntity deleted = product("Đã Xóa", "Deleted Item", "da-xoa", "deleted-item",
            "Bị xóa mềm", "Soft deleted",
            "GoneBrand", dienTu.getId(), ProductStatus.PUBLISHED, 300_000L, null, null,
            false, List.of(), "4.0", 5);
        deleted.setDeletedAt(Instant.now());
        products.save(deleted);

        // list — total không tính soft-deleted, item vắng mặt
        JsonNode body = get("/api/catalog/products");
        assertThat(body.get("total").asInt()).isEqualTo(5);
        assertThat(slugs(body)).doesNotContain("da-xoa");

        // PDP — slug vi lẫn en đều 404 problem+json
        for (String slug : List.of("da-xoa", "deleted-item")) {
            ResponseEntity<String> r = http.getForEntity("/api/catalog/products/" + slug, String.class);
            assertThat(r.getStatusCode().value()).as("slug %s", slug).isEqualTo(404);
            assertThat(r.getHeaders().getContentType().toString()).contains("application/problem+json");
        }
    }

    // ── 400 param lỗi ────────────────────────────────────────────────────────

    @Test
    void paramLoiTra400ProblemJson() {
        for (String url : List.of(
            "/api/catalog/products?sort=bogus",
            "/api/catalog/products?page=0",
            "/api/catalog/products?size=101",
            "/api/catalog/products?minPrice=abc")) {
            ResponseEntity<String> r = http.getForEntity(url, String.class);
            assertThat(r.getStatusCode().value()).as("url %s", url).isEqualTo(400);
            assertThat(r.getHeaders().getContentType().toString()).contains("application/problem+json");
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void assertNewestSort() throws Exception {
        JsonNode body = get("/api/catalog/products?sort=newest");
        Map<UUID, Instant> createdAt = products.findAll().stream()
            .filter(p -> p.getStatus() == ProductStatus.PUBLISHED)
            .collect(Collectors.toMap(ProductEntity::getId, p -> p.getCreatedAt() == null ? Instant.EPOCH : p.getCreatedAt()));
        Instant prev = null;
        for (JsonNode item : body.get("items")) {
            Instant current = createdAt.get(UUID.fromString(item.get("id").asText()));
            if (prev != null) {
                assertThat(current).as("createdAt phải non-tăng (newest DESC)").isBeforeOrEqualTo(prev);
            }
            prev = current;
        }
    }

    private JsonNode get(String path) throws Exception {
        ResponseEntity<String> r = http.getForEntity(path, String.class);
        assertThat(r.getStatusCode().value()).as("GET %s → %s", path, r.getStatusCode()).isEqualTo(200);
        return om.readTree(r.getBody());
    }

    private static List<String> slugs(JsonNode page) {
        return StreamSupport.stream(page.get("items").spliterator(), false)
            .map(i -> i.get("slug").asText())
            .toList();
    }

    private static JsonNode find(JsonNode page, String slug) {
        return StreamSupport.stream(page.get("items").spliterator(), false)
            .filter(i -> i.get("slug").asText().equals(slug))
            .findFirst()
            .orElseThrow();
    }

    private CategoryEntity category(String vi, String en, String slugVi, String slugEn, UUID parent) {
        CategoryEntity c = new CategoryEntity();
        c.setName(new I18nText(vi, en));
        c.setSlugVi(slugVi);
        c.setSlugEn(slugEn);
        c.setParentId(parent);
        return categories.save(c);
    }

    private ProductEntity product(String nameVi, String nameEn, String slugVi, String slugEn,
                                  String descVi, String descEn, String brand, UUID categoryId,
                                  ProductStatus status, long price, Long comparePrice, Instant flash,
                                  boolean official, List<String> tags, String ratingAvg, int ratingCount) {
        ProductEntity p = new ProductEntity();
        p.setName(new I18nText(nameVi, nameEn));
        p.setSlugVi(slugVi);
        p.setSlugEn(slugEn);
        p.setDescription(new I18nText(descVi, descEn));
        p.setBrand(brand);
        p.setCategoryId(categoryId);
        p.setStatus(status);
        p.setPrice(price);
        p.setComparePrice(comparePrice);
        p.setFlashSaleEndsAt(flash);
        p.setOfficial(official);
        p.setTags(tags);
        p.setRatingAvg(new BigDecimal(ratingAvg));
        p.setRatingCount(ratingCount);
        return products.save(p);
    }

    private void image(ProductEntity p, String url, String alt, int position) {
        ProductImageEntity i = new ProductImageEntity();
        i.setProductId(p.getId());
        i.setUrl(url);
        i.setAlt(alt);
        i.setPosition(position);
        images.save(i);
    }

    private void variant(ProductEntity p, String nameVi, String nameEn, String size, String color, Long price) {
        ProductVariantEntity v = new ProductVariantEntity();
        v.setProductId(p.getId());
        v.setNameI18n(nameVi == null ? null : new I18nText(nameVi, nameEn));
        v.setSize(size);
        v.setColor(color);
        v.setPrice(price);
        v.setSkuCode("SKU-" + size + "-" + color);
        variants.save(v);
    }
}
