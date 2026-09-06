package com.ecommerce.catalog.reviews;

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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import com.ecommerce.catalog.ReviewsItHarness;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT me/reviews (SF-8 Task 8 nhóm 3 — spec Q1): chỉ thấy review của mình;
 * filter productId; PUT/DELETE chỉ PENDING (APPROVED → 409); review người
 * khác → 404 (không lộ existence).
 */
@Tag("integration")
class MeReviewsTest extends ReviewsItHarness {

    @Autowired
    CategoryRepository categories;
    @Autowired
    ProductRepository products;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void meListChiCuaMinhVaFilterProductId() throws Exception {
        ProductEntity p1 = seedProduct("Me A");
        ProductEntity p2 = seedProduct("Me B");
        UUID mine = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        submit(p1, mine, 5);
        submit(p2, mine, 4);
        submit(p1, other, 3); // người khác

        // Mình thấy 2 review (mọi status), người kia thấy 1 — cách ly theo user
        assertThat(meTotal(mine, null)).isEqualTo(2);
        assertThat(meTotal(other, null)).isEqualTo(1);

        // Filter productId → chỉ review của product đó
        assertThat(meTotal(mine, p1.getId())).isEqualTo(1);

        // productName resolve vi + status PENDING + field đủ
        JsonNode items = om.readTree(meJson(mine, null)).get("items");
        assertThat(items.get(0).get("status").asText()).isEqualTo("PENDING");
        assertThat(items.get(0).get("productName").asText()).startsWith("Me ");
    }

    @Test
    void putDeletePENDINGVaGuard409Va404NguoiKhac() throws Exception {
        ProductEntity p1 = seedProduct("Edit Guard");
        ProductEntity p2 = seedProduct("Edit Guard Two");
        UUID mine = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        UUID reviewId = reviewIdOf(submit(p1, mine, 5), mine, p1);
        submit(p2, mine, 4);

        // PUT PENDING của mình → 200, đổi rating/content
        ResponseEntity<String> edited = putReview(mine, reviewId,
            Map.of("rating", 2, "title", "Sửa lại", "content", "Không hay như lúc đầu"));
        assertThat(edited.getStatusCode().value()).isEqualTo(200);
        JsonNode editedBody = om.readTree(edited.getBody());
        assertThat(editedBody.get("rating").asInt()).isEqualTo(2);
        assertThat(editedBody.get("content").asText()).isEqualTo("Không hay như lúc đầu");

        // DELETE review NGƯỜI KHÁC → 404 (không lộ existence — spec Q1)
        assertThat(deleteReview(stranger, reviewId).getStatusCode().value()).isEqualTo(404);

        // Approve → PUT/DELETE của chính mình cũng 409 (không còn PENDING)
        approve(reviewId);
        assertThat(putReview(mine, reviewId, Map.of("rating", 1, "content", "x")).getStatusCode().value()).isEqualTo(409);
        assertThat(deleteReview(mine, reviewId).getStatusCode().value()).isEqualTo(409);

        // DELETE PENDING của mình → 204 + biến mất
        UUID review2 = reviewIdOf(submit(p1, stranger, 3), stranger, p1);
        assertThat(deleteReview(stranger, review2).getStatusCode().value()).isEqualTo(204);
        Integer gone = jdbc.queryForObject("SELECT count(*) FROM reviews WHERE id = ?", Integer.class, review2);
        assertThat(gone).isEqualTo(0);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private String meJson(UUID userId, UUID productIdFilter) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        String path = "http://localhost:" + httpPort() + "/api/catalog/me/reviews"
            + (productIdFilter == null ? "" : "?productId=" + productIdFilter);
        return http.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class).getBody();
    }

    private int meTotal(UUID userId, UUID productIdFilter) throws Exception {
        return om.readTree(meJson(userId, productIdFilter)).get("total").asInt();
    }

    private ResponseEntity<String> putReview(UUID userId, UUID reviewId, Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange("http://localhost:" + httpPort() + "/api/catalog/me/reviews/" + reviewId,
            HttpMethod.PUT, new HttpEntity<>(payload, headers), String.class);
    }

    private ResponseEntity<String> deleteReview(UUID userId, UUID reviewId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        return http.exchange("http://localhost:" + httpPort() + "/api/catalog/me/reviews/" + reviewId,
            HttpMethod.DELETE, new HttpEntity<>(headers), String.class);
    }

    private void approve(UUID reviewId) {
        HttpHeaders admin = new HttpHeaders();
        admin.setBearerAuth(mintTokenFor("it-admin", "ADMIN"));
        ResponseEntity<String> res = http.exchange(
            "http://localhost:" + httpPort() + "/api/catalog/admin/reviews/" + reviewId + "/approve",
            HttpMethod.POST, new HttpEntity<>(admin), String.class);
        assertThat(res.getStatusCode().value()).isEqualTo(200);
    }

    private UUID submit(ProductEntity product, UUID userId, int rating) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> res = http.exchange(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + product.getSlugVi() + "/reviews",
            HttpMethod.POST,
            new HttpEntity<>(Map.of("rating", rating, "content", "Nội dung " + rating), headers), String.class);
        assertThat(res.getStatusCode().value()).isEqualTo(202);
        return userId;
    }

    private UUID reviewIdOf(UUID userId, UUID ignoredUserId, ProductEntity product) {
        return UUID.fromString(jdbc.queryForObject(
            "SELECT id FROM reviews WHERE user_id = ? AND product_id = ?", String.class, userId, product.getId()));
    }

    private ProductEntity seedProduct(String label) {
        CategoryEntity cat = new CategoryEntity();
        cat.setName(new I18nText(label, label));
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
        p.setStatus(ProductStatus.PUBLISHED);
        p.setPrice(250000);
        return products.save(p);
    }
}
