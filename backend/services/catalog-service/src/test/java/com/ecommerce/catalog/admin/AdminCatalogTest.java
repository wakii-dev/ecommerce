package com.ecommerce.catalog.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import com.ecommerce.catalog.AbstractIntegrationTest;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.web.dto.ProductWriteDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT admin CRUD + guard JWT + outbox producer (Task 8b).
 *
 * <p>Token mint bằng {@code mintToken(role)} — ký bằng keypair IT mà decoder
 * đang đọc ({@code JWT_PUBLIC_KEY_PATH} từ base): phủ 401 (không token),
 * 403 (role CUSTOMER), 200/201 (ADMIN).</p>
 */
class AdminCatalogTest extends AbstractIntegrationTest {

    static final String EVENT_TYPE = "product.changed";

    @Autowired
    CategoryRepository categories;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;

    CategoryEntity root;
    CategoryEntity child;

    @BeforeEach
    void cleanAndSeedCategories() {
        jdbc.update("DELETE FROM outbox");
        jdbc.update("DELETE FROM product_variants");
        jdbc.update("DELETE FROM product_images");
        jdbc.update("DELETE FROM products");
        // Self-FK: xóa CON trước CHA
        jdbc.update("DELETE FROM categories WHERE parent_id IS NOT NULL");
        jdbc.update("DELETE FROM categories WHERE parent_id IS NULL");

        root = category("Điện Tử", "Electronics", "dien-tu-admin", "electronics-admin", null);
        child = category("Phụ Kiện", "Accessories", "phu-kien-admin", "accessories-admin", root.getId());
    }

    // ── guard ────────────────────────────────────────────────────────────────

    @Test
    void noTokenIs401() {
        ResponseEntity<JsonNode> res = call(HttpMethod.GET, "/api/catalog/admin/products", null, null);
        assertThat(res.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void customerRoleIs403() {
        String token = mintToken("CUSTOMER");
        assertThat(call(HttpMethod.GET, "/api/catalog/admin/products", token, null).getStatusCode().value())
            .isEqualTo(403);
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/products", token,
            writeDto("Áo", "Shirt", "Áo cotton", "Cotton shirt", "ao-403", "shirt-403",
                100_000, null, child.getId())).getStatusCode().value()).isEqualTo(403);
        // Public vẫn vào được — guard chỉ chặn admin
        assertThat(call(HttpMethod.GET, "/api/catalog/products", token, null).getStatusCode().value())
            .isEqualTo(200);
    }

    // ── product CRUD + publish flow ─────────────────────────────────────────

    @Test
    void adminProductCrudAndPublishFlow() {
        String token = mintToken("ADMIN");
        ProductWriteDto write = writeDto("Tai Nghe Admin", "Admin Headset", "Pin 40h", "40h battery",
            "tai-nghe-admin", "headset-admin", 1_200_000, null, child.getId());

        // POST DRAFT → 201 + view i18n gốc
        ResponseEntity<JsonNode> created = call(HttpMethod.POST, "/api/catalog/admin/products", token, write);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        JsonNode view = created.getBody();
        UUID id = UUID.fromString(view.path("id").asText());
        assertThat(view.path("status").asText()).isEqualTo("DRAFT");
        assertThat(view.path("nameI18n").path("vi").asText()).isEqualTo("Tai Nghe Admin");
        assertThat(view.path("slugVi").asText()).isEqualTo("tai-nghe-admin");
        assertThat(view.path("images")).hasSize(2);
        assertThat(view.path("variants")).hasSize(1);

        // GET theo id → 200
        assertThat(call(HttpMethod.GET, "/api/catalog/admin/products/" + id, token, null)
            .getStatusCode().value()).isEqualTo(200);

        // PUT status PUBLISHED (publish = PUT ProductWrite.status) → 200 PUBLISHED
        ResponseEntity<JsonNode> updated = call(HttpMethod.PUT, "/api/catalog/admin/products/" + id, token,
            new ProductWriteDto(write.nameI18n(), write.descriptionI18n(), null, null, write.slugVi(),
                write.slugEn(), write.brand(), write.price(), null, null, write.tags(), write.categoryId(),
                write.images(), write.variants(), com.ecommerce.catalog.domain.ProductStatus.PUBLISHED));
        assertThat(updated.getStatusCode().value()).isEqualTo(200);
        assertThat(updated.getBody().path("status").asText()).isEqualTo("PUBLISHED");

        // Admin list: q theo tên + status filter → thấy đúng 1
        // (q không dấu cách — TestRestTemplate URI-template double-encode %20)
        ResponseEntity<JsonNode> list = call(
            HttpMethod.GET, "/api/catalog/admin/products?q=Admin&status=PUBLISHED", token, null);
        assertThat(list.getStatusCode().value()).isEqualTo(200);
        assertThat(list.getBody().path("total").asLong()).isEqualTo(1);
        assertThat(list.getBody().path("items").get(0).path("status").asText()).isEqualTo("PUBLISHED");
        assertThat(list.getBody().path("items").get(0).path("slugVi").asText()).isEqualTo("tai-nghe-admin");

        // DELETE → 204 → admin GET 404 (soft-delete, admin không thùng rác)
        assertThat(call(HttpMethod.DELETE, "/api/catalog/admin/products/" + id, token, null)
            .getStatusCode().value()).isEqualTo(204);
        assertThat(call(HttpMethod.GET, "/api/catalog/admin/products/" + id, token, null)
            .getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void viOnlyI18nCreates() { // §5.11/Q5b — omit en hoàn toàn
        String token = mintToken("ADMIN");
        Map<String, Object> viOnly = Map.of(
            "nameI18n", Map.of("vi", "Sản Phẩm Chỉ Vi"),
            "descriptionI18n", Map.of("vi", "Mô tả chỉ tiếng Việt"),
            "slugVi", "chi-vi", "slugEn", "vi-only",
            "price", 99_000, "categoryId", child.getId().toString(),
            "status", "DRAFT");
        ResponseEntity<JsonNode> res = call(HttpMethod.POST, "/api/catalog/admin/products", token, viOnly);
        assertThat(res.getStatusCode().value()).isEqualTo(201);
        assertThat(res.getBody().path("name").asText()).isEqualTo("Sản Phẩm Chỉ Vi"); // resolve fallback vi
    }

    @Test
    void variantPriceDeltaRoundtrip() {
        String token = mintToken("ADMIN");
        ProductWriteDto write = writeDto("Áo Delta", "Delta Shirt", "Áo đẹp", "Nice shirt",
            "ao-delta", "delta-shirt", 1_000_000, null, root.getId());
        UUID id = UUID.fromString(call(HttpMethod.POST, "/api/catalog/admin/products", token, write)
            .getBody().path("id").asText());

        // Đọc admin view + PDP public — priceDelta = stored-price − product.price (Q5c)
        JsonNode view = call(HttpMethod.GET, "/api/catalog/admin/products/" + id, token, null).getBody();
        assertThat(view.path("variants").get(0).path("priceDelta").asLong()).isEqualTo(500_000);
        assertThat(view.path("variants").get(0).path("options").path("color").asText()).isEqualTo("Đỏ");
        assertThat(view.path("variants").get(0).path("stock").asInt()).isZero(); // stock ignore (SF-5)

        // PUT đổi price GỐC + gửi lại cùng priceDelta → delta vẫn đúng (ghi lại tuyệt đối theo giá mới)
        ResponseEntity<JsonNode> updated = call(HttpMethod.PUT, "/api/catalog/admin/products/" + id, token,
            new ProductWriteDto(write.nameI18n(), write.descriptionI18n(), null, null, write.slugVi(),
                write.slugEn(), write.brand(), 2_000_000L, null, null, write.tags(), write.categoryId(),
                write.images(), write.variants(), null));
        assertThat(updated.getStatusCode().value()).isEqualTo(200);
        assertThat(updated.getBody().path("variants").get(0).path("priceDelta").asLong()).isEqualTo(500_000);
        // stored tuyệt đối = price mới + delta (Q5c) — verify thẳng cột DB
        Long storedPrice = jdbc.queryForObject(
            "SELECT price FROM product_variants WHERE product_id = ?", Long.class, id);
        assertThat(storedPrice).isEqualTo(2_500_000L);
    }

    @Test
    void duplicateSlugConflicts409() {
        String token = mintToken("ADMIN");
        ProductWriteDto first = writeDto("SP Đầu", "First", "mô tả", "desc", "sp-trung", "dup-slug",
            10_000, null, root.getId());
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/products", token, first).getStatusCode().value())
            .isEqualTo(201);
        ProductWriteDto second = writeDto("SP Sau", "Second", "mô tả", "desc", "sp-trung", "khac-slug",
            20_000, null, root.getId()); // trùng slug_vi
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/products", token, second).getStatusCode().value())
            .isEqualTo(409);
        // Category cũng unique slug vi/en
        Map<String, Object> cat = Map.of(
            "nameI18n", Map.of("vi", "Trùng", "en", "Dup"),
            "slugVi", "dien-tu-admin", "slugEn", "dup-slug-en");
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/categories", token, cat).getStatusCode().value())
            .isEqualTo(409);
    }

    // ── outbox producer ─────────────────────────────────────────────────────

    @Test
    void createPublishedEmitsOutboxCreated() {
        String token = mintToken("ADMIN");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        headers.set("X-Request-Id", "it-req-42");
        ProductWriteDto write = writeDto("SP Outbox", "Outbox Product", "mô tả", "desc", "sp-outbox",
            "outbox-product", 500_000, com.ecommerce.catalog.domain.ProductStatus.PUBLISHED, root.getId());
        HttpEntity<ProductWriteDto> entity = new HttpEntity<>(write, headers);
        ResponseEntity<JsonNode> res = http.exchange("/api/catalog/admin/products", HttpMethod.POST, entity,
            JsonNode.class);
        assertThat(res.getStatusCode().value()).isEqualTo(201);

        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT correlation_id, payload::text AS payload FROM outbox WHERE event_type = ?", EVENT_TYPE);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("correlation_id")).isEqualTo("it-req-42");
        JsonNode envelope = parse(rows.get(0).get("payload").toString());
        JsonNode payload = envelope.path("payload");
        assertThat(payload.path("action").asText()).isEqualTo("CREATED");
        assertThat(payload.path("productId").asText())
            .isEqualTo(res.getBody().path("id").asText());
        assertThat(payload.path("slugVi").asText()).isEqualTo("sp-outbox");
        assertThat(payload.path("slugEn").asText()).isEqualTo("outbox-product");
        assertThat(payload.path("changedAt").asText()).isNotBlank();
    }

    @Test
    void deleteSoftDeletesAndEmitsDeleted() {
        String token = mintToken("ADMIN");
        ProductWriteDto write = writeDto("SP Xóa", "Delete Product", "mô tả", "desc", "sp-xoa",
            "delete-product", 300_000, com.ecommerce.catalog.domain.ProductStatus.PUBLISHED, root.getId());
        UUID id = UUID.fromString(call(HttpMethod.POST, "/api/catalog/admin/products", token, write)
            .getBody().path("id").asText());

        // PDP public thấy trước khi xóa
        assertThat(call(HttpMethod.GET, "/api/catalog/products/sp-xoa", null, null).getStatusCode().value())
            .isEqualTo(200);

        call(HttpMethod.DELETE, "/api/catalog/admin/products/" + id, token, null);

        // PDP + list public KHÔNG còn (service-level exclusion) + event DELETED
        assertThat(call(HttpMethod.GET, "/api/catalog/products/sp-xoa", null, null).getStatusCode().value())
            .isEqualTo(404);
        JsonNode list = call(HttpMethod.GET, "/api/catalog/products?size=100", null, null).getBody();
        assertThat(list.path("total").asLong()).isZero();

        List<String> actions = jdbc.queryForList(
            "SELECT payload::text FROM outbox WHERE event_type = ? ORDER BY created_at", String.class, EVENT_TYPE)
            .stream().map(p -> parse(p).path("payload").path("action").asText()).toList();
        assertThat(actions).containsExactly("CREATED", "DELETED");
    }

    // ── category ────────────────────────────────────────────────────────────

    @Test
    void categoryCrudAndTree() {
        String token = mintToken("ADMIN");
        // Tree: root + child đã seed — nameI18n + slugVi trả GỐC
        ResponseEntity<JsonNode> tree = call(HttpMethod.GET, "/api/catalog/admin/categories", token, null);
        assertThat(tree.getStatusCode().value()).isEqualTo(200);
        assertThat(tree.getBody()).hasSize(1);
        JsonNode rootNode = tree.getBody().get(0);
        assertThat(rootNode.path("nameI18n").path("en").asText()).isEqualTo("Electronics");
        assertThat(rootNode.path("slugVi").asText()).isEqualTo("dien-tu-admin");
        assertThat(rootNode.path("children")).hasSize(1);
        assertThat(rootNode.path("children").get(0).path("slugVi").asText()).isEqualTo("phu-kien-admin");

        // GET theo id → node con có children rỗng
        JsonNode childNode = call(HttpMethod.GET, "/api/catalog/admin/categories/" + child.getId(), token, null)
            .getBody();
        assertThat(childNode.path("parentId").asText()).isEqualTo(root.getId().toString());
        assertThat(childNode.path("children")).isEmpty();

        // PUT đổi tên → 200
        ResponseEntity<JsonNode> updated = call(HttpMethod.PUT, "/api/catalog/admin/categories/" + child.getId(),
            token, Map.of("nameI18n", Map.of("vi", "Phụ Kiện Mới", "en", "New Accessories"),
                "slugVi", "phu-kien-admin", "slugEn", "accessories-admin"));
        assertThat(updated.getStatusCode().value()).isEqualTo(200);
        assertThat(updated.getBody().path("nameI18n").path("vi").asText()).isEqualTo("Phụ Kiện Mới");

        // Cycle: parent = chính nó → 400
        assertThat(call(HttpMethod.PUT, "/api/catalog/admin/categories/" + root.getId(), token,
            Map.of("nameI18n", Map.of("vi", "Điện Tử"), "slugVi", "dien-tu-admin", "slugEn", "electronics-admin",
                "parentId", root.getId().toString())).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void deleteCategoryBlockedByChildrenOrProducts() {
        String token = mintToken("ADMIN");
        ProductWriteDto write = writeDto("SP Cat", "Cat Product", "mô tả", "desc", "sp-cat", "cat-product",
            50_000, null, child.getId());
        UUID productId = UUID.fromString(call(HttpMethod.POST, "/api/catalog/admin/products", token, write)
            .getBody().path("id").asText());

        // root còn CON → 409
        assertThat(call(HttpMethod.DELETE, "/api/catalog/admin/categories/" + root.getId(), token, null)
            .getStatusCode().value()).isEqualTo(409);
        // child còn PRODUCT (chưa soft-delete) → 409
        assertThat(call(HttpMethod.DELETE, "/api/catalog/admin/categories/" + child.getId(), token, null)
            .getStatusCode().value()).isEqualTo(409);

        // Xóa product → child xóa được → sau đó root xóa được
        ResponseEntity<JsonNode> productDelete = call(
            HttpMethod.DELETE, "/api/catalog/admin/products/" + productId, token, null);
        assertThat(productDelete.getStatusCode().value())
            .as("delete product: " + productDelete.getBody()).isEqualTo(204);
        ResponseEntity<JsonNode> childDelete = call(
            HttpMethod.DELETE, "/api/catalog/admin/categories/" + child.getId(), token, null);
        assertThat(childDelete.getStatusCode().value())
            .as("delete child: " + childDelete.getBody()).isEqualTo(204);
        assertThat(call(HttpMethod.DELETE, "/api/catalog/admin/categories/" + root.getId(), token, null)
            .getStatusCode().value()).isEqualTo(204);
    }

    @Test
    void invalidWritesAre400() {
        String token = mintToken("ADMIN");
        // vi rỗng → 400
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/products", token,
            Map.of("nameI18n", Map.of("vi", "", "en", "Blank"),
                "descriptionI18n", Map.of("vi", "mô tả"),
                "slugVi", "blank-vi", "slugEn", "blank-vi",
                "price", 1000, "categoryId", root.getId().toString())).getStatusCode().value()).isEqualTo(400);
        // price âm → 400
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/products", token,
            Map.of("nameI18n", Map.of("vi", "Giá Âm"), "descriptionI18n", Map.of("vi", "mô tả"),
                "slugVi", "gia-am", "slugEn", "negative-price",
                "price", -1, "categoryId", root.getId().toString())).getStatusCode().value()).isEqualTo(400);
        // categoryId không tồn tại → 400
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/products", token,
            Map.of("nameI18n", Map.of("vi", "Cat Lạc"), "descriptionI18n", Map.of("vi", "mô tả"),
                "slugVi", "cat-lac", "slugEn", "missing-cat",
                "price", 1000, "categoryId", UUID.randomUUID().toString())).getStatusCode().value())
            .isEqualTo(400);
        // thiếu cả nameI18n → 400
        assertThat(call(HttpMethod.POST, "/api/catalog/admin/products", token,
            Map.of("descriptionI18n", Map.of("vi", "mô tả"), "slugVi", "thieu-name", "slugEn", "no-name",
                "price", 1000, "categoryId", root.getId().toString())).getStatusCode().value()).isEqualTo(400);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ResponseEntity<JsonNode> call(HttpMethod method, String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        if (token != null) {
            headers.setBearerAuth(token);
        }
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        HttpEntity<?> entity = body != null ? new HttpEntity<>(body, headers) : new HttpEntity<>(headers);
        return http.exchange(path, method, entity, JsonNode.class);
    }

    private CategoryEntity category(String vi, String en, String slugVi, String slugEn, UUID parentId) {
        CategoryEntity entity = new CategoryEntity();
        entity.setName(new I18nText(vi, en));
        entity.setSlugVi(slugVi);
        entity.setSlugEn(slugEn);
        entity.setParentId(parentId);
        return categories.save(entity);
    }

    private static ProductWriteDto writeDto(String nameVi, String nameEn, String descVi, String descEn,
                                            String slugVi, String slugEn, long price,
                                            com.ecommerce.catalog.domain.ProductStatus status, UUID categoryId) {
        return new ProductWriteDto(
            new I18nText(nameVi, nameEn), new I18nText(descVi, descEn), null, null,
            slugVi, slugEn, "BrandX", price, 1_500_000L, null,
            List.of("Chính hãng"), categoryId,
            List.of(new ProductWriteDto.ProductImageWrite("http://img/1.png", nameVi, 0),
                new ProductWriteDto.ProductImageWrite("http://img/2.png", nameVi, 1)),
            List.of(new ProductWriteDto.VariantWrite(new I18nText("Đỏ / XL", "Red / XL"),
                Map.of("color", "Đỏ", "size", "XL"), 500_000L, 99)),
            status);
    }

    private JsonNode parse(String json) {
        try {
            return om.readTree(json);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
