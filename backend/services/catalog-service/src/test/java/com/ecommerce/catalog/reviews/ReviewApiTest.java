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

import com.ecommerce.catalog.ReviewsItHarness;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT Review APIs public (SF-8 Task 8 nhóm 1 — spec Q4/Q5): submit 202
 * no-body + 401 + validation 400 + duplicate 409 + draft 404; PENDING KHÔNG
 * hiện public; breakdown "5".."1" luôn đủ key.
 */
@Tag("integration")
class ReviewApiTest extends ReviewsItHarness {

    @Autowired
    CategoryRepository categories;
    @Autowired
    ProductRepository products;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;

    @Test
    void submit202VaPENDINGKhongHienPublicVaBreakdownDayKey() throws Exception {
        ProductEntity product = seedPublishedProduct();

        ResponseEntity<String> res = submit(product.getSlugVi(), Map.of("rating", 4, "title", "Ổn", "content", "Tốt"));
        assertThat(res.getStatusCode().value()).isEqualTo(202);
        assertThat(res.getBody()).as("202 no-body theo contract").isNull();

        // PENDING không hiện công khai — nhưng breakdown luôn đủ key "5".."1"
        String body = http.getForEntity(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + product.getSlugVi() + "/reviews", String.class)
            .getBody();
        var list = om.readTree(body);
        assertThat(list.get("total").asInt()).isEqualTo(0);
        assertThat(list.get("items")).isEmpty();
        var breakdown = list.get("breakdown");
        assertThat(breakdown.size()).isEqualTo(5);
        for (int star = 1; star <= 5; star++) {
            assertThat(breakdown.get(String.valueOf(star)).asInt()).isEqualTo(0);
        }
    }

    @Test
    void submitKhongToken401VaValidation400() {
        ProductEntity product = seedPublishedProduct();

        // 401 — không token
        ResponseEntity<String> noAuth = http.postForEntity(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + product.getSlugVi() + "/reviews",
            new HttpEntity<>(Map.of("rating", 5, "content", "x")), String.class);
        assertThat(noAuth.getStatusCode().value()).isEqualTo(401);

        // 400 — rating ngoài 1..5
        assertThat(submit(product.getSlugVi(), Map.of("rating", 0, "content", "x")).getStatusCode().value()).isEqualTo(400);
        assertThat(submit(product.getSlugVi(), Map.of("rating", 6, "content", "x")).getStatusCode().value()).isEqualTo(400);
        // 400 — content blank
        assertThat(submit(product.getSlugVi(), Map.of("rating", 5, "content", "   ")).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void submitTrungUser409VaDraftProduct404VaSlugLa404() {
        ProductEntity product = seedPublishedProduct();
        UUID user = UUID.randomUUID();

        assertThat(submit(product.getSlugVi(), user, Map.of("rating", 5, "content", "lần đầu")).getStatusCode().value())
            .isEqualTo(202);
        // Policy 1 review/user/product — submit lần 2 → 409
        assertThat(submit(product.getSlugVi(), user, Map.of("rating", 3, "content", "lần hai")).getStatusCode().value())
            .isEqualTo(409);

        // Draft → 404 (không review được sản phẩm chưa publish)
        ProductEntity draft = seedPublishedProduct();
        draft.setStatus(ProductStatus.DRAFT);
        products.save(draft);
        assertThat(submit(draft.getSlugVi(), UUID.randomUUID(), Map.of("rating", 5, "content", "x")).getStatusCode().value())
            .isEqualTo(404);

        // Slug lạ → 404
        assertThat(submit("slug-khong-ton-tai-" + UUID.randomUUID().toString().substring(0, 6),
            UUID.randomUUID(), Map.of("rating", 5, "content", "x")).getStatusCode().value()).isEqualTo(404);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ResponseEntity<String> submit(String slug, Map<String, Object> payload) {
        return submit(slug, UUID.randomUUID(), payload);
    }

    private ResponseEntity<String> submit(String slug, UUID userId, Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange("http://localhost:" + httpPort() + "/api/catalog/products/" + slug + "/reviews",
            HttpMethod.POST, new HttpEntity<>(payload, headers), String.class);
    }

    private ProductEntity seedPublishedProduct() {
        CategoryEntity cat = new CategoryEntity();
        cat.setName(new I18nText("Review Cat", "Review Cat"));
        cat.setSlugVi("review-cat-" + UUID.randomUUID().toString().substring(0, 8));
        cat.setSlugEn("review-cat-en-" + UUID.randomUUID().toString().substring(0, 8));
        cat = categories.save(cat);

        ProductEntity p = new ProductEntity();
        p.setName(new I18nText("Sản phẩm review " + UUID.randomUUID().toString().substring(0, 6),
            "Review product " + UUID.randomUUID().toString().substring(0, 6)));
        p.setSlugVi("sp-review-" + UUID.randomUUID().toString().substring(0, 8));
        p.setSlugEn("sp-review-en-" + UUID.randomUUID().toString().substring(0, 8));
        p.setDescription(new I18nText("Mô tả", "Description"));
        p.setCategoryId(cat.getId());
        p.setStatus(ProductStatus.PUBLISHED);
        p.setPrice(199000);
        return products.save(p);
    }
}
