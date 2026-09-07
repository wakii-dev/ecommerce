package com.ecommerce.catalog.stockalert;

import com.ecommerce.catalog.AbstractIntegrationTest;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.domain.ProductVariantEntity;
import com.ecommerce.catalog.repo.ProductRepository;
import com.ecommerce.catalog.repo.ProductVariantRepository;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT stock alert (SF-15): register 202/idempotent/404/400 + guard còn-hàng +
 * internal candidates (chỉ variant available) + claim atomic + token 401.
 * Inventory = WireMock double (pattern payment-service).
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class StockAlertApiIntegrationTest extends AbstractIntegrationTest {

    static final WireMockServer WIRE = new WireMockServer(WireMockConfiguration.wireMockConfig().dynamicPort());
    static final String TOKEN = "it-internal-token";

    static ProductEntity product;
    static UUID variantId;

    @Autowired TestRestTemplate http;
    @Autowired ProductRepository products;
    @Autowired ProductVariantRepository variants;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void stockAlertProps(DynamicPropertyRegistry registry) {
        WIRE.start();
        registry.add("inventory.base-url", WIRE::baseUrl);
        registry.add("catalog.internal-token", () -> TOKEN);
    }

    @BeforeAll
    static void startWire() {
        if (!WIRE.isRunning()) WIRE.start();
    }

    @AfterAll
    static void stopWire() {
        WIRE.stop();
    }

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM stock_alerts");
        jdbc.update("DELETE FROM product_variants");
        jdbc.update("DELETE FROM product_images");
        jdbc.update("DELETE FROM products");

        product = new ProductEntity();
        product.setName(new I18nText("Tai Nghe Bluetooth", "Bluetooth Headset"));
        product.setSlugVi("tai-nghe");
        product.setSlugEn("bluetooth-headset");
        product.setDescription(new I18nText("Mô tả", "Desc"));
        product.setStatus(ProductStatus.PUBLISHED);
        product.setPrice(500_000L);
        product.setRatingAvg(new BigDecimal("4.5"));
        product = products.save(product);

        ProductVariantEntity variant = new ProductVariantEntity();
        variant.setProductId(product.getId());
        variant.setColor("Đen");
        variant.setSize("M");
        variant = variants.save(variant);
        variantId = variant.getId();
    }

    /** availability trả sẵn cho mọi variantIds — đổi available giữa các test. */
    private static void stubAvailability(int available) {
        WIRE.resetAll();
        WIRE.stubFor(get(urlEqualTo("/inventory/availability?variantIds=" + variantId))
            .willReturn(aResponse().withHeader("Content-Type", "application/json")
                .withBody("[{\"variantId\":\"" + variantId + "\",\"available\":" + available + ",\"reserved\":0}]")));
    }

    private ResponseEntity<String> register(String email, UUID variant) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange("/api/catalog/products/tai-nghe/stock-alert", HttpMethod.POST,
            new HttpEntity<>("{\"email\":\"" + email + "\",\"variantId\":\"" + variant + "\"}", headers),
            String.class);
    }

    private ResponseEntity<String> internal(HttpMethod method, String path, String token, String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) headers.set("X-Internal-Token", token);
        return http.exchange(path, method, new HttpEntity<>(body, headers), String.class);
    }

    @Test
    @Order(1)
    void register_happy_idempotent_and_guards() {
        stubAvailability(0); // hết hàng
        assertThat(register("buyer@example.com", variantId).getStatusCode().value()).isEqualTo(202);
        // dup ACTIVE → vẫn 202 (idempotent, không tạo row thứ 2)
        assertThat(register("buyer@example.com", variantId).getStatusCode().value()).isEqualTo(202);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM stock_alerts", Integer.class)).isEqualTo(1);

        // slug lạ → 404 (problem+json)
        ResponseEntity<String> missing = http.postForEntity(
            "/api/catalog/products/khong-ton-tai/stock-alert",
            new HttpEntity<>("{\"email\":\"b@example.com\",\"variantId\":\"" + variantId + "\"}",
                jsonHeaders()), String.class);
        assertThat(missing.getStatusCode().value()).isEqualTo(404);
        assertThat(missing.getHeaders().getContentType().toString()).contains("application/problem+json");

        // variant không thuộc product → 400
        assertThat(register("b@example.com", UUID.randomUUID()).getStatusCode().value()).isEqualTo(400);
        // email sai → 400
        assertThat(register("khong-phai-email", variantId).getStatusCode().value()).isEqualTo(400);

        // variant ĐANG còn hàng → 400 (guard bypass client)
        stubAvailability(5);
        assertThat(register("b@example.com", variantId).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    @Order(2)
    void candidates_onlyWhenAvailable() {
        registerSilently("buyer@example.com");
        // availability 0 → candidates rỗng
        stubAvailability(0);
        String empty = internal(HttpMethod.GET, "/api/catalog/internal/stock-alerts/candidates?limit=50",
            TOKEN, null).getBody();
        assertThat(empty).isEqualTo("[]");

        // hàng về (availability 3) → candidate có email + slug + tên vi
        stubAvailability(3);
        String body = internal(HttpMethod.GET, "/api/catalog/internal/stock-alerts/candidates?limit=50",
            TOKEN, null).getBody();
        assertThat(body).contains("buyer@example.com").contains("tai-nghe").contains("Tai Nghe Bluetooth");
    }

    @Test
    @Order(3)
    void claim_atomic_and_secondClaimEmpty() {
        registerSilently("buyer@example.com");
        stubAvailability(3);
        String candidates = internal(HttpMethod.GET, "/api/catalog/internal/stock-alerts/candidates?limit=50",
            TOKEN, null).getBody();
        String id = UUID.fromString(candidates.replaceAll(".*\"alertId\":\"([^\"]+)\".*", "$1")).toString();

        String claimed = internal(HttpMethod.POST, "/api/catalog/internal/stock-alerts/claim", TOKEN,
            "{\"ids\":[\"" + id + "\"]}").getBody();
        assertThat(claimed).contains(id).contains("buyer@example.com");

        // claim lại → rỗng (đã NOTIFIED) — email chỉ gửi 1 lần
        String again = internal(HttpMethod.POST, "/api/catalog/internal/stock-alerts/claim", TOKEN,
            "{\"ids\":[\"" + id + "\"]}").getBody();
        assertThat(again).isEqualTo("[]");
        assertThat(jdbc.queryForObject(
            "SELECT status FROM stock_alerts WHERE id = ?::uuid", String.class, id)).isEqualTo("NOTIFIED");
    }

    @Test
    @Order(4)
    void internal_requiresToken() {
        stubAvailability(0);
        registerSilently("buyer@example.com");
        assertThat(internal(HttpMethod.GET, "/api/catalog/internal/stock-alerts/candidates?limit=50",
            null, null).getStatusCode().value()).isEqualTo(401);
        assertThat(internal(HttpMethod.GET, "/api/catalog/internal/stock-alerts/candidates?limit=50",
            "sai-token", null).getStatusCode().value()).isEqualTo(401);
    }

    private void registerSilently(String email) {
        stubAvailability(0);
        register(email, variantId);
    }

    private HttpHeaders jsonHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}
