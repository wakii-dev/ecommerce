package com.ecommerce.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.stream.StreamSupport;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;

import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT cây danh mục public (Task 3): shape đệ quy, children sort theo tên ĐÃ
 * resolve (vi/en khác thứ tự), locale resolution cả hai ngôn ngữ, slugEn luôn trả.
 */
class CategoryApiTest extends AbstractIntegrationTest {

    @Autowired
    CategoryRepository categories;
    @Autowired
    com.ecommerce.catalog.repo.ProductRepository products;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;

    CategoryEntity dienTu;
    CategoryEntity thoiTrang;
    CategoryEntity phuKien;
    CategoryEntity laptop;

    @BeforeEach
    void seed() {
        // Products tham chiếu categories (fk) — wipe TRƯỚC (cascade images/variants).
        // Container PG dùng chung nhiều Spring context → IT khác có thể để lại products.
        products.deleteAll();
        // Self-FK parent_id: phải xóa CON trước khi xóa CHA
        jdbc.update("DELETE FROM categories WHERE parent_id IS NOT NULL");
        jdbc.update("DELETE FROM categories WHERE parent_id IS NULL");
        dienTu = category("Điện Tử", "Electronics", "dien-tu", "electronics", null);
        thoiTrang = category("Thời Trang", "Fashion", "thoi-trang", "fashion", null);
        // 2 con của Điện Tử — tên sort khác nhau giữa vi (Laptop < Phụ Kiện) và en (Accessories < Laptops)
        phuKien = category("Phụ Kiện", "Accessories", "phu-kien", "accessories", dienTu.getId());
        laptop = category("Laptop", "Laptops", "laptop", "laptops", dienTu.getId());
    }

    @Test
    void cayDanhMucViDungShapeVaThuTu() {
        JsonNode roots = get("/api/catalog/categories");
        assertThat(roots.size()).isEqualTo(2);
        // sort codepoint: 'T' (0x54) < 'Đ' (0x110) → Thời Trang trước Điện Tử
        assertThat(name(roots, 0)).isEqualTo("Thời Trang");
        assertThat(name(roots, 1)).isEqualTo("Điện Tử");

        JsonNode dt = roots.get(1); // vi codepoint: Thời Trang (T) trước Điện Tử (Đ)
        assertThat(dt.get("slug").asText()).isEqualTo("dien-tu");
        assertThat(dt.get("slugEn").asText()).isEqualTo("electronics");
        assertThat(dt.has("parentId")).isFalse(); // root → parentId vắng (NON_NULL)

        JsonNode children = dt.get("children");
        assertThat(children.size()).isEqualTo(2);
        assertThat(childName(children, 0)).isEqualTo("Laptop");  // vi: "Laptop" < "Phụ Kiện"
        assertThat(childName(children, 1)).isEqualTo("Phụ Kiện");
        assertThat(children.get(1).get("slug").asText()).isEqualTo("phu-kien");
        assertThat(children.get(1).get("slugEn").asText()).isEqualTo("accessories");
        assertThat(children.get(1).get("parentId").asText()).isEqualTo(dienTu.getId().toString());
        assertThat(children.get(1).get("children").isEmpty()).isTrue(); // leaf → children []
    }

    @Test
    void cayDanhMucEnResolveVaThuTuTheoTenEn() {
        JsonNode roots = get("/api/catalog/categories?locale=en");
        assertThat(roots.size()).isEqualTo(2);
        assertThat(name(roots, 0)).isEqualTo("Electronics");
        assertThat(name(roots, 1)).isEqualTo("Fashion");

        JsonNode dt = roots.get(0);
        assertThat(dt.get("name").asText()).isEqualTo("Electronics");
        assertThat(dt.get("slug").asText()).isEqualTo("electronics"); // slug resolve theo locale
        assertThat(dt.get("slugEn").asText()).isEqualTo("electronics");

        JsonNode children = dt.get("children");
        assertThat(childName(children, 0)).isEqualTo("Accessories"); // en: "Accessories" < "Laptops"
        assertThat(childName(children, 1)).isEqualTo("Laptops");
        assertThat(children.get(0).get("slug").asText()).isEqualTo("accessories");
    }

    @Test
    void acceptHeaderEnKhiKhongLocaleParam() {
        JsonNode roots = getWithAcceptLanguage("/api/catalog/categories", "en");
        assertThat(name(roots, 0)).isEqualTo("Electronics");
    }

    private JsonNode get(String path) {
        ResponseEntity<String> r = http.getForEntity(path, String.class);
        assertThat(r.getStatusCode().value()).as("GET %s → %s", path, r.getStatusCode()).isEqualTo(200);
        try {
            return om.readTree(r.getBody());
        } catch (Exception e) {
            throw new IllegalStateException("parse JSON fail cho " + path, e);
        }
    }

    private JsonNode getWithAcceptLanguage(String path, String lang) {
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.set(org.springframework.http.HttpHeaders.ACCEPT_LANGUAGE, lang);
        ResponseEntity<String> r = http.exchange(path, org.springframework.http.HttpMethod.GET,
            new org.springframework.http.HttpEntity<>(null, headers), String.class);
        assertThat(r.getStatusCode().value()).isEqualTo(200);
        try {
            return om.readTree(r.getBody());
        } catch (Exception e) {
            throw new IllegalStateException("parse JSON fail cho " + path, e);
        }
    }

    private static String name(JsonNode roots, int index) {
        return roots.get(index).get("name").asText();
    }

    private static String childName(JsonNode children, int index) {
        return children.get(index).get("name").asText();
    }

    private CategoryEntity category(String vi, String en, String slugVi, String slugEn, UUID parent) {
        CategoryEntity c = new CategoryEntity();
        c.setName(new I18nText(vi, en));
        c.setSlugVi(slugVi);
        c.setSlugEn(slugEn);
        c.setParentId(parent);
        return categories.save(c);
    }
}
