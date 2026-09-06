package com.ecommerce.catalog.reviews;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
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
 * IT moderation + rating aggregate (SF-8 Task 8 nhóm 2 — spec Q6/Q7/Q8):
 * admin list default PENDING; approve → public thấy + aggregate recompute
 * (pin {5,4,4} → 4.3/3 — Convention #9); reject → không hiện + aggregate giữ;
 * double-transition 409; outbox review.moderated khít schema; non-admin 403.
 */
@Tag("integration")
class ModerationAggregateTest extends ReviewsItHarness {

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
    void approveHienPublicVaAggregatePin4_3Va3() throws Exception {
        ProductEntity product = seedProduct("Aggregate Pin");
        UUID ra = reviewOf(submit(product, 5), product);
        UUID rb = reviewOf(submit(product, 4), product);
        UUID rc = reviewOf(submit(product, 4), product);
        UUID rd = reviewOf(submit(product, 5), product); // sẽ bị REJECT

        // Admin list default PENDING — PHẢI chứa đủ 4 review của product này
        // (PG singleton dùng chung JVM nên admin list là global — assert membership,
        // không assert total tuyệt đối để tránh pollution từ IT class khác)
        JsonNode pending = om.readTree(getAdminJson("/api/catalog/admin/reviews?size=100"));
        var pendingIds = new java.util.HashSet<String>();
        pending.get("items").forEach(i -> pendingIds.add(i.get("id").asText()));
        assertThat(pendingIds).contains(ra.toString(), rb.toString(), rc.toString(), rd.toString());

        approve(ra);
        approve(rb);
        approve(rc);
        // Chưa reject rd — aggregate recompute từ 3 review: (5+4+4)/3 = 4.3, count 3
        assertAggregate(product.getId(), "4.3", 3);

        // Public thấy 3 review
        JsonNode list = om.readTree(http.getForEntity(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + product.getSlugVi() + "/reviews", String.class)
            .getBody());
        assertThat(list.get("total").asInt()).isEqualTo(3);

        // REJECT rd → không hiện public, aggregate GIỮ nguyên (rejected chưa từng tính)
        reject(rd);
        JsonNode list2 = om.readTree(http.getForEntity(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + product.getSlugVi() + "/reviews", String.class)
            .getBody());
        assertThat(list2.get("total").asInt()).isEqualTo(3);
        assertAggregate(product.getId(), "4.3", 3);

        // Double-transition → 409
        assertThat(adminPost("/api/catalog/admin/reviews/" + ra + "/approve").getStatusCode().value()).isEqualTo(409);
        assertThat(adminPost("/api/catalog/admin/reviews/" + ra + "/reject").getStatusCode().value()).isEqualTo(409);

        // Outbox review.moderated — scoped theo productId của class này (PG singleton).
        // LƯU Ý: cột payload lưu ENVELOPE JSON → business payload nằm ở payload->'payload'
        Integer approvedEvents = jdbc.queryForObject(
            "SELECT count(*) FROM outbox WHERE event_type = 'review.moderated' AND payload->'payload'->>'status' = 'APPROVED' AND payload->'payload'->>'productId' = ?",
            Integer.class, product.getId().toString());
        Integer rejectedEvents = jdbc.queryForObject(
            "SELECT count(*) FROM outbox WHERE event_type = 'review.moderated' AND payload->'payload'->>'status' = 'REJECTED' AND payload->'payload'->>'productId' = ?",
            Integer.class, product.getId().toString());
        assertThat(approvedEvents).isEqualTo(3);
        assertThat(rejectedEvents).isEqualTo(1);
        // Payload đủ field schema (reviewId/productId/userId/rating/moderatedAt)
        Integer schemaOk = jdbc.queryForObject("""
            SELECT count(*) FROM outbox
            WHERE event_type = 'review.moderated' AND payload->'payload'->>'productId' = ?
              AND payload->'payload'->>'reviewId' IS NOT NULL
              AND payload->'payload'->>'userId' IS NOT NULL AND payload->'payload'->>'rating' IS NOT NULL
              AND payload->'payload'->>'moderatedAt' IS NOT NULL
            """, Integer.class, product.getId().toString());
        assertThat(schemaOk).isEqualTo(4);
    }

    @Test
    void nonAdmin403VaFilterStatus() throws Exception {
        ProductEntity product = seedProduct("Guard Filter");
        submit(product, 3);

        // CUSTOMER token → 403 (path guard /api/catalog/admin/**)
        HttpHeaders customer = new HttpHeaders();
        customer.setBearerAuth(mintTokenFor(UUID.randomUUID().toString(), "CUSTOMER"));
        ResponseEntity<String> forbidden = http.exchange(
            "http://localhost:" + httpPort() + "/api/catalog/admin/reviews", HttpMethod.GET,
            new HttpEntity<>(customer), String.class);
        assertThat(forbidden.getStatusCode().value()).isEqualTo(403);

        // Filter status=REJECTED → 0 (chỉ có PENDING)
        JsonNode rejected = om.readTree(getAdminJson("/api/catalog/admin/reviews?status=REJECTED"));
        assertThat(rejected.get("total").asInt()).isEqualTo(0);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private void assertAggregate(UUID productId, String expectedAvg, int expectedCount) {
        Map<String, Object> row = jdbc.queryForMap("SELECT rating_avg, rating_count FROM products WHERE id = ?", productId);
        assertThat(((BigDecimal) row.get("rating_avg")).toPlainString()).isEqualTo(expectedAvg);
        assertThat(((Number) row.get("rating_count")).intValue()).isEqualTo(expectedCount);
    }

    private String getAdminJson(String path) {
        HttpHeaders admin = new HttpHeaders();
        admin.setBearerAuth(mintTokenFor("it-admin", "ADMIN"));
        return http.exchange("http://localhost:" + httpPort() + path, HttpMethod.GET,
            new HttpEntity<>(admin), String.class).getBody();
    }

    private ResponseEntity<String> adminPost(String path) {
        HttpHeaders admin = new HttpHeaders();
        admin.setBearerAuth(mintTokenFor("it-admin", "ADMIN"));
        return http.exchange("http://localhost:" + httpPort() + path, HttpMethod.POST,
            new HttpEntity<>(admin), String.class);
    }

    private void approve(UUID reviewId) {
        assertThat(adminPost("/api/catalog/admin/reviews/" + reviewId + "/approve").getStatusCode().value())
            .isEqualTo(200);
    }

    private void reject(UUID reviewId) {
        assertThat(adminPost("/api/catalog/admin/reviews/" + reviewId + "/reject").getStatusCode().value())
            .isEqualTo(200);
    }

    /** Review id của user vừa submit cho product (jdbc — admin list không filter theo product). */
    private UUID reviewOf(UUID userId, ProductEntity product) {
        return UUID.fromString(jdbc.queryForObject(
            "SELECT id FROM reviews WHERE user_id = ? AND product_id = ?", String.class, userId, product.getId()));
    }

    private UUID submit(ProductEntity product, int rating) {
        UUID userId = UUID.randomUUID();
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
