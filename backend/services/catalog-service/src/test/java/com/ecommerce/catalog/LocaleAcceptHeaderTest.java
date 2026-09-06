package com.ecommerce.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.StreamSupport;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT Accept-Language (Conventions #4, D17): không có {@code ?locale} → header
 * quyết định; {@code ?locale} LUÔN thắng header; ngôn ngữ lạ → fallback vi.
 */
class LocaleAcceptHeaderTest extends AbstractIntegrationTest {

    @Autowired
    ProductRepository products;
    @Autowired
    CategoryRepository categories;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;
    @Autowired
    ObjectMapper om;

    @BeforeEach
    void seed() {
        products.deleteAll();
        // Self-FK parent_id: xóa CON trước CHA (deleteAll không đảm bảo thứ tự)
        jdbc.update("DELETE FROM categories WHERE parent_id IS NOT NULL");
        jdbc.update("DELETE FROM categories WHERE parent_id IS NULL");
        CategoryEntity dienTu = new CategoryEntity();
        dienTu.setName(new I18nText("Điện Tử", "Electronics"));
        dienTu.setSlugVi("dien-tu");
        dienTu.setSlugEn("electronics");
        categories.save(dienTu);

        ProductEntity p = new ProductEntity();
        p.setName(new I18nText("Tai Nghe Bluetooth", "Bluetooth Headset"));
        p.setSlugVi("tai-nghe");
        p.setSlugEn("bluetooth-headset");
        p.setDescription(new I18nText("Mô tả tiếng Việt", "English description"));
        p.setCategoryId(dienTu.getId());
        p.setStatus(ProductStatus.PUBLISHED);
        p.setPrice(500_000L);
        p.setRatingAvg(new BigDecimal("4.5"));
        products.save(p);
    }

    @Test
    void acceptLanguageEnKhongLocaleParam() throws Exception {
        JsonNode body = getWithHeader("/api/catalog/products", "en");
        JsonNode tai = findBySlugEn(body, "bluetooth-headset");
        assertThat(tai.get("name").asText()).isEqualTo("Bluetooth Headset");
        assertThat(tai.get("slug").asText()).isEqualTo("bluetooth-headset");
    }

    @Test
    void localeParamThangAcceptLanguage() throws Exception {
        // ?locale=vi + header en → vẫn vi
        JsonNode body = getWithHeader("/api/catalog/products?locale=vi", "en");
        JsonNode tai = findBySlugEn(body, "bluetooth-headset");
        assertThat(tai.get("name").asText()).isEqualTo("Tai Nghe Bluetooth");
        assertThat(tai.get("slug").asText()).isEqualTo("tai-nghe");
    }

    @Test
    void acceptLanguageNhieuTagChonTagHopLe() throws Exception {
        // "ja-JP, en;q=0.9" — ja không hỗ trợ → en
        JsonNode en = getWithHeader("/api/catalog/products", "ja-JP, en;q=0.9");
        assertThat(findBySlugEn(en, "bluetooth-headset").get("name").asText()).isEqualTo("Bluetooth Headset");
        // chỉ ngôn ngữ lạ → fallback vi
        JsonNode vi = getWithHeader("/api/catalog/products", "fr-FR");
        assertThat(findBySlugEn(vi, "bluetooth-headset").get("name").asText()).isEqualTo("Tai Nghe Bluetooth");
    }

    private JsonNode getWithHeader(String path, String acceptLanguage) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.ACCEPT_LANGUAGE, acceptLanguage);
        ResponseEntity<String> r = http.exchange(path, HttpMethod.GET, new HttpEntity<>(null, headers), String.class);
        assertThat(r.getStatusCode().value()).as("GET %s", path).isEqualTo(200);
        try {
            return om.readTree(r.getBody());
        } catch (Exception e) {
            throw new IllegalStateException("parse JSON fail cho " + path, e);
        }
    }

    private static JsonNode findBySlugEn(JsonNode page, String slugEn) {
        return StreamSupport.stream(page.get("items").spliterator(), false)
            .filter(i -> i.get("slugEn").asText().equals(slugEn))
            .findFirst()
            .orElseThrow();
    }
}
