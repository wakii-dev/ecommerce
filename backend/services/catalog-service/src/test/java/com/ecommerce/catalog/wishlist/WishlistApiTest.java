package com.ecommerce.catalog.wishlist;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import com.ecommerce.catalog.ReviewsItHarness;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductImageEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductImageRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT wishlist APIs (SF-8 Task 8 nhóm 4 — spec Q11): PUT idempotent (dedupe 1
 * row) + ids + page enrich (name/price/ảnh, locale vi/en, chỉ PUBLISHED) +
 * DELETE luôn 204 (kể cả lần 2) + 401 + PUT product lạ/draft 404.
 */
@Tag("integration")
class WishlistApiTest extends ReviewsItHarness {

    @Autowired
    CategoryRepository categories;
    @Autowired
    ProductRepository products;
    @Autowired
    ProductImageRepository images;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void putDedupeIdsPageEnrichVaDeleteLuon204() throws Exception {
        UUID user = UUID.randomUUID();
        ProductEntity p1 = seedProduct("Wish A", true);
        ProductEntity p2 = seedProduct("Wish B", true);
        images.save(image(p1, 0, "https://cdn.example/a.png"));

        // PUT → 204; PUT lại → vẫn 204 và chỉ 1 row (dedupe)
        assertThat(put(user, p1.getId()).getStatusCode().value()).isEqualTo(204);
        assertThat(put(user, p1.getId()).getStatusCode().value()).isEqualTo(204);
        assertThat(put(user, p2.getId()).getStatusCode().value()).isEqualTo(204);
        Integer rows = jdbc.queryForObject(
            "SELECT count(*) FROM wishlist_items WHERE user_id = ?", Integer.class, user);
        assertThat(rows).isEqualTo(2);

        // ids — heart state
        JsonNode ids = om.readTree(get(user, "/api/catalog/me/wishlist/ids"));
        assertThat(ids.get("productIds")).hasSize(2);

        // Page enrich — mới thêm trước (p2 trước p1), field ProductCard đủ
        JsonNode page = om.readTree(get(user, "/api/catalog/me/wishlist?page=1&size=20"));
        assertThat(page.get("total").asInt()).isEqualTo(2);
        assertThat(page.get("items").get(0).get("id").asText()).isEqualTo(p2.getId().toString());
        assertThat(page.get("items").get(1).get("name").asText()).startsWith("Wish A");
        assertThat(page.get("items").get(1).get("price").asLong()).isEqualTo(p1.getPrice());
        assertThat(page.get("items").get(1).get("image").get("url").asText()).isEqualTo("https://cdn.example/a.png");

        // Locale en — name resolve en
        JsonNode pageEn = om.readTree(get(user, "/api/catalog/me/wishlist?page=1&size=20&locale=en"));
        assertThat(pageEn.get("items").get(1).get("name").asText()).startsWith("Wish A en");

        // Product về DRAFT sau khi heart → biến mất khỏi items (ids giữ nguyên);
        // total = số row wishlist (chân lý phân trang — không trừ item bị ẩn)
        p2.setStatus(ProductStatus.DRAFT);
        products.save(p2);
        JsonNode pageAfter = om.readTree(get(user, "/api/catalog/me/wishlist"));
        assertThat(pageAfter.get("items")).hasSize(1);
        assertThat(pageAfter.get("total").asInt()).isEqualTo(2);
        JsonNode idsAfter = om.readTree(get(user, "/api/catalog/me/wishlist/ids"));
        assertThat(idsAfter.get("productIds")).hasSize(2);

        // DELETE → 204; DELETE lần 2 (không còn) → vẫn 204 idempotent
        assertThat(delete(user, p2.getId()).getStatusCode().value()).isEqualTo(204);
        assertThat(delete(user, p2.getId()).getStatusCode().value()).isEqualTo(204);
        Integer rowsAfter = jdbc.queryForObject(
            "SELECT count(*) FROM wishlist_items WHERE user_id = ? AND product_id = ?", Integer.class, user, p2.getId());
        assertThat(rowsAfter).isEqualTo(0);
    }

    @Test
    void guard401VaPutProductLa404VaDraft404() {
        UUID user = UUID.randomUUID();

        // 401 không token cho cả 4 endpoint
        String base = "http://localhost:" + httpPort() + "/api/catalog/me/wishlist";
        assertThat(http.getForEntity(base, String.class).getStatusCode().value()).isEqualTo(401);
        assertThat(http.getForEntity(base + "/ids", String.class).getStatusCode().value()).isEqualTo(401);
        assertThat(http.exchange(base + "/" + UUID.randomUUID(), HttpMethod.PUT,
            HttpEntity.EMPTY, String.class).getStatusCode().value()).isEqualTo(401);
        assertThat(http.exchange(base + "/" + UUID.randomUUID(), HttpMethod.DELETE,
            HttpEntity.EMPTY, String.class).getStatusCode().value()).isEqualTo(401);

        // PUT product lạ → 404; PUT draft → 404
        assertThat(put(user, UUID.randomUUID()).getStatusCode().value()).isEqualTo(404);
        ProductEntity draft = seedProduct("Wish Draft", false);
        assertThat(put(user, draft.getId()).getStatusCode().value()).isEqualTo(404);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ResponseEntity<String> put(UUID userId, UUID productId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        return http.exchange("http://localhost:" + httpPort() + "/api/catalog/me/wishlist/" + productId,
            HttpMethod.PUT, new HttpEntity<>(headers), String.class);
    }

    private ResponseEntity<String> delete(UUID userId, UUID productId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        return http.exchange("http://localhost:" + httpPort() + "/api/catalog/me/wishlist/" + productId,
            HttpMethod.DELETE, new HttpEntity<>(headers), String.class);
    }

    private String get(UUID userId, String path) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        return http.exchange("http://localhost:" + httpPort() + path,
            HttpMethod.GET, new HttpEntity<>(headers), String.class).getBody();
    }

    private ProductImageEntity image(ProductEntity p, int position, String url) {
        ProductImageEntity img = new ProductImageEntity();
        img.setProductId(p.getId());
        img.setUrl(url);
        img.setPosition(position);
        return img;
    }

    private ProductEntity seedProduct(String label, boolean published) {
        CategoryEntity cat = new CategoryEntity();
        cat.setName(new I18nText(label, label + " en"));
        cat.setSlugVi(label.toLowerCase().replace(" ", "-") + "-" + UUID.randomUUID().toString().substring(0, 8));
        cat.setSlugEn(label.toLowerCase().replace(" ", "-") + "-en-" + UUID.randomUUID().toString().substring(0, 8));
        cat = categories.save(cat);

        ProductEntity p = new ProductEntity();
        p.setName(new I18nText(label + " " + UUID.randomUUID().toString().substring(0, 6),
            label + " en " + UUID.randomUUID().toString().substring(0, 6)));
        p.setSlugVi(label.toLowerCase().replace(" ", "-") + "-p-" + UUID.randomUUID().toString().substring(0, 8));
        p.setSlugEn(label.toLowerCase().replace(" ", "-") + "-p-en-" + UUID.randomUUID().toString().substring(0, 8));
        p.setDescription(new I18nText("Mô tả", "Description"));
        p.setCategoryId(cat.getId());
        p.setStatus(published ? ProductStatus.PUBLISHED : ProductStatus.DRAFT);
        p.setPrice(899000);
        return products.save(p);
    }
}
