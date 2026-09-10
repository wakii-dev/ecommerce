package com.ecommerce.partner;

import com.ecommerce.partner.auth.ApiKeyService;
import com.ecommerce.partner.domain.ApiKeyEntity;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.repo.ApiKeyRepository;
import com.ecommerce.partner.repo.PartnerRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 3 — catalog proxy qua WireMock double (ACCEPTANCE: "curl key →
 * products trả JSON catalog"). Cả endpoint đều cần key catalog:read.
 */
class PartnerCatalogTest extends AbstractPartnerApiTest {

    static final ParameterizedTypeReference<Map<String, Object>> MAP =
        new ParameterizedTypeReference<>() {
        };
    static final ParameterizedTypeReference<List<Map<String, Object>>> LIST =
        new ParameterizedTypeReference<>() {
        };

    @Autowired
    private PartnerRepository partners;

    @Autowired
    private ApiKeyRepository apiKeys;

    private String rawKey;

    @BeforeEach
    void stubAndKey() {
        WIRE.resetAll();
        rawKey = newKey();
    }

    @AfterEach
    void reset() {
        WIRE.resetAll();
    }

    private String newKey() {
        PartnerEntity partner = new PartnerEntity();
        partner.setName("CAT-IT-" + System.nanoTime());
        partner.setWebhookSecret("ws-" + System.nanoTime());
        partner = partners.save(partner);
        String raw = ApiKeyService.generateRawKey();
        ApiKeyEntity key = new ApiKeyEntity();
        key.setPartnerId(partner.getId());
        key.setKeyHash(ApiKeyService.sha256Hex(raw));
        key.setPrefix(ApiKeyService.prefixOf(raw));
        key.setScopes(List.of("catalog:read", "orders:read", "orders:write"));
        apiKeys.save(key);
        return raw;
    }

    private HttpHeaders headers() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-Key", rawKey);
        return headers;
    }

    private ResponseEntity<Map<String, Object>> apiGet(String path) {
        return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(headers()), MAP);
    }

    @Test
    void listProducts_mapsToPartnerShape() {
        WIRE.stubFor(get(urlPathEqualTo("/api/catalog/products"))
            .willReturn(okJson("""
                {"items": [{
                    "id": "%s", "slug": "iphone-15", "name": "iPhone 15",
                    "brand": "Apple", "price": 21990000, "comparePrice": 24990000,
                    "tags": ["apple"], "image": {"url": "https://x/y.png"}, "categoryId": "%s"}
                ], "page": 1, "size": 20, "total": 1}
                """.formatted(UUID.randomUUID(), UUID.randomUUID()))));

        ResponseEntity<Map<String, Object>> response = apiGet("/open-api/v1/products?page=1&size=20");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = response.getBody();
        assertThat(body.get("page")).isEqualTo(1);
        assertThat(body.get("size")).isEqualTo(20);
        assertThat(((Number) body.get("total")).longValue()).isEqualTo(1);
        Map<String, Object> item = items(body).get(0);
        assertThat(item.keySet()).contains("id", "slug", "name", "price", "updatedAt");
        // KHÔNG lộ field nội bộ
        assertThat(item.keySet()).doesNotContain("brand", "tags", "image", "comparePrice", "categoryId");
    }

    @Test
    void productBySlug_mapsVariantsPrice() {
        String productId = UUID.randomUUID().toString();
        String variantId = UUID.randomUUID().toString();
        WIRE.stubFor(get(urlEqualTo("/api/catalog/products/iphone-15"))
            .willReturn(okJson("""
                {"id": "%s", "slug": "iphone-15", "name": "iPhone 15", "price": 21990000,
                 "description": "Điện thoại Apple", "brand": "Apple",
                 "variants": [{"id": "%s", "name": "Đen / 128GB", "priceDelta": 2000000, "stock": 5}]}
                """.formatted(productId, variantId))));

        ResponseEntity<Map<String, Object>> response = apiGet("/open-api/v1/products/iphone-15");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = response.getBody();
        assertThat(body.get("description")).isEqualTo("Điện thoại Apple");
        Map<String, Object> variant = variants(body).get(0);
        // giá variant = base + priceDelta (21990000 + 2000000)
        assertThat(((Number) variant.get("price")).longValue()).isEqualTo(23990000L);
        assertThat(variant.keySet()).doesNotContain("stock");
    }

    @Test
    void productBySlug_notFound_is404() {
        WIRE.stubFor(get(urlEqualTo("/api/catalog/products/unknown"))
            .willReturn(aResponse().withStatus(404)));
        assertThat(apiGet("/open-api/v1/products/unknown").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void productByUuid_proxiesPublicById() {
        // SF-4/FI-408: UUID-lookup đi public by-id (GAP-3 admin-token đã xóa);
        // PUBLISHED-only — draft/deleted → catalog 404 → partner NOT_FOUND
        String id = UUID.randomUUID().toString();
        WIRE.stubFor(get(urlEqualTo("/api/catalog/products/by-id/" + id))
            .willReturn(okJson("{\"id\": \"" + id + "\", \"slug\": \"iphone-15\", \"name\": \"iPhone 15\", \"price\": 21990000}")));
        ResponseEntity<Map<String, Object>> response = apiGet("/open-api/v1/products/" + id);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("id")).isEqualTo(id);
    }

    @Test
    void productByUuid_notFound_is404() {
        // draft/deleted UUID → catalog by-id 404 → partner NOT_FOUND (trước đây
        // 502 GAP-3 khi token rỗng — behavior đã xóa)
        String id = UUID.randomUUID().toString();
        WIRE.stubFor(get(urlEqualTo("/api/catalog/products/by-id/" + id))
            .willReturn(aResponse().withStatus(404)));
        assertThat(apiGet("/open-api/v1/products/" + id).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void categories_flattenTree() {
        String parentId = UUID.randomUUID().toString();
        String childId = UUID.randomUUID().toString();
        WIRE.stubFor(get(urlEqualTo("/api/catalog/categories"))
            .willReturn(okJson("""
                [{"id": "%s", "slug": "dien-thoai", "name": "Điện thoại", "parentId": null,
                  "children": [{"id": "%s", "slug": "android", "name": "Android", "parentId": "%s",
                                "children": []}]}]
                """.formatted(parentId, childId, parentId))));

        ResponseEntity<List<Map<String, Object>>> response = rest.exchange(
            "/open-api/v1/categories", HttpMethod.GET, new HttpEntity<>(headers()), LIST);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> flat = response.getBody();
        assertThat(flat).hasSize(2);
        assertThat(flat.get(0).get("id")).isEqualTo(parentId);
        assertThat(flat.get(0).get("slug")).isEqualTo("dien-thoai");
        assertThat(flat.get(0).get("parentId")).isNull();
        assertThat(flat.get(1).get("id")).isEqualTo(childId);
        assertThat(flat.get(1).get("parentId")).isEqualTo(parentId);
    }

    @Test
    void search_proxiesAndValidatesQ() {
        WIRE.stubFor(get(urlPathEqualTo("/api/catalog/search"))
            .willReturn(okJson("{\"items\": [], \"page\": 1, \"size\": 20, \"total\": 0}")));
        ResponseEntity<Map<String, Object>> ok = apiGet("/open-api/v1/search?q=iphone");
        assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(items(ok.getBody())).isEmpty();

        // q > 200 ký tự → 400 (contract maxLength 200 — GAP-5 note)
        String longQ = "x".repeat(201);
        assertThat(apiGet("/open-api/v1/search?q=" + longQ).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void catalogDown_is502() {
        WIRE.stubFor(get(urlPathEqualTo("/api/catalog/products"))
            .willReturn(aResponse().withStatus(500)));
        assertThat(apiGet("/open-api/v1/products").getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Map<String, Object> page) {
        return (List<Map<String, Object>>) page.get("items");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> variants(Map<String, Object> detail) {
        return (List<Map<String, Object>>) detail.get("variants");
    }
}
