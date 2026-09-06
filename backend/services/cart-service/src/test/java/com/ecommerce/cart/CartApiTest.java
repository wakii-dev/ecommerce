package com.ecommerce.cart;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cart CRUD API (SF-6 Task 3) — guest cookie flow, auto-create + Set-Cookie
 * trên POST /items, GET 404 khi guest chưa có giỏ, validation, PATCH/DELETE.
 * HTTP thẳng qua JDK HttpClient (đọc Set-Cookie header tường minh).
 */
class CartApiTest extends AbstractCartIntegrationTest {

    @LocalServerPort
    int port;

    private final HttpClient http = HttpClient.newHttpClient();

    private String base() {
        return "http://localhost:" + port;
    }

    private record Reply(int status, String body, Optional<String> setCookie) {
    }

    private Reply send(HttpRequest request) throws Exception {
        HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
        return new Reply(res.statusCode(), res.body(),
            res.headers().firstValue("Set-Cookie"));
    }

    private HttpRequest req(String method, String path, String bearer, String cookie, String body) {
        HttpRequest.Builder b = HttpRequest.newBuilder().uri(URI.create(base() + path));
        if (bearer != null) b.header("Authorization", "Bearer " + bearer);
        if (cookie != null) b.header("Cookie", cookie);
        if (body != null) b.header("Content-Type", "application/json").method(method,
            HttpRequest.BodyPublishers.ofString(body));
        else b.method(method, HttpRequest.BodyPublishers.noBody());
        return b.build();
    }

    private String stubCatalogProduct(String slug, String name, long price, UUID variantId, long priceDelta) {
        String variantJson = variantId != null
            ? ",\"variants\":[{\"id\":\"" + variantId + "\",\"priceDelta\":" + priceDelta + "}]"
            : "";
        String body = "{\"name\":\"" + name + "\",\"image\":{\"url\":\"https://img.test/" + slug
            + ".webp\"},\"price\":" + price + variantJson + "}";
        CATALOG_WIREMOCK.stubFor(get(urlEqualTo("/api/catalog/products/" + slug))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody(body)));
        return body;
    }

    // ── POST /api/cart ─────────────────────────────────────────────────────

    @Test
    void createCartIssuesHttpOnlyCookie() throws Exception {
        Reply reply = send(req("POST", "/api/cart", null, null, null));
        assertThat(reply.status()).isEqualTo(201);
        String cookie = reply.setCookie().orElseThrow();
        assertThat(cookie).contains("cart_token=");
        assertThat(cookie).contains("HttpOnly");
        assertThat(cookie).contains("SameSite=Lax");
        assertThat(cookie).contains("Path=/api/cart");
    }

    @Test
    void createCartIdempotentForExistingGuestCookie() throws Exception {
        Reply first = send(req("POST", "/api/cart", null, null, null));
        String cookie = first.setCookie().orElseThrow().split(";")[0];

        Reply second = send(req("POST", "/api/cart", null, cookie, null));
        assertThat(second.status()).isEqualTo(200);
        assertThat(second.setCookie()).isEmpty(); // không cấp token mới
    }

    // ── GET /api/cart ──────────────────────────────────────────────────────

    @Test
    void getCartGuestWithoutCookieIs404() throws Exception {
        Reply reply = send(req("GET", "/api/cart", null, null, null));
        assertThat(reply.status()).isEqualTo(404);
        assertThat(reply.body()).contains("guest_cart_not_found");
    }

    @Test
    void getCartUserWithoutCartReturnsEmpty() throws Exception {
        String token = mintToken("user-get-empty");
        Reply reply = send(req("GET", "/api/cart", token, null, null));
        assertThat(reply.status()).isEqualTo(200);
        assertThat(reply.body()).contains("\"items\":[]");
        assertThat(reply.body()).doesNotContain("cartToken"); // user cart không lộ token
    }

    // ── POST /api/cart/items ───────────────────────────────────────────────

    @Test
    void addItemAutoCreatesGuestCartAndSetsCookie() throws Exception {
        UUID productId = UUID.randomUUID();
        stubCatalogProduct("iphone-15", "iPhone 15", 5000000, null, 0);

        Reply reply = send(req("POST", "/api/cart/items?slug=iphone-15", null, null,
            "{\"productId\":\"" + productId + "\",\"qty\":2}"));
        assertThat(reply.status()).isEqualTo(200);
        String cookie = reply.setCookie().orElseThrow(() -> new AssertionError(
            "POST /items phải Set-Cookie khi guest chưa có giỏ (pin spec)"));
        assertThat(cookie).contains("cart_token=");
        assertThat(reply.body()).contains("\"qty\":2");
        assertThat(reply.body()).contains("\"unitPrice\":5000000"); // enrich từ catalog
        assertThat(reply.body()).contains("\"name\":\"iPhone 15\"");
        assertThat(reply.body()).contains("\"subtotal\":10000000"); // 2 × 5.000.000
    }

    @Test
    void addItemWithCookieDedupesSameLine() throws Exception {
        UUID productId = UUID.randomUUID();
        stubCatalogProduct("dedupe-item", "Dedupe Item", 100000, null, 0);
        Reply first = send(req("POST", "/api/cart/items?slug=dedupe-item", null, null,
            "{\"productId\":\"" + productId + "\",\"qty\":1}"));
        String cookie = first.setCookie().orElseThrow().split(";")[0];

        Reply second = send(req("POST", "/api/cart/items?slug=dedupe-item", null, cookie,
            "{\"productId\":\"" + productId + "\",\"qty\":2}"));
        assertThat(second.status()).isEqualTo(200);
        assertThat(second.body()).contains("\"qty\":3"); // cộng dòng, không tạo dòng mới
        assertThat(second.body()).contains("\"items\":[{"); // vẫn 1 phần tử
    }

    @Test
    void addItemCatalog404RejectsWithProductNotFound() throws Exception {
        UUID productId = UUID.randomUUID();
        CATALOG_WIREMOCK.stubFor(get(urlEqualTo("/api/catalog/products/draft-item"))
            .willReturn(aResponse().withStatus(404)));

        Reply reply = send(req("POST", "/api/cart/items?slug=draft-item", null, null,
            "{\"productId\":\"" + productId + "\",\"qty\":1}"));
        assertThat(reply.status()).isEqualTo(404);
        assertThat(reply.body()).contains("product_not_found");
    }

    @Test
    void addItemWhenCatalogDeadAcceptsUnpricedLine() throws Exception {
        // Pin spec: catalog CHẾT lúc add (khác 404) → nhận item không enrichment.
        // 503 stub mô phỏng chết — KHÔNG stop()/start() WireMock chung (poison
        // dynamic port + stub registry cho các class sau trong context dùng chung).
        CATALOG_WIREMOCK.stubFor(get(urlEqualTo("/api/catalog/products/dead-catalog"))
            .willReturn(aResponse().withStatus(503)));
        UUID productId = UUID.randomUUID();
        Reply reply = send(req("POST", "/api/cart/items?slug=dead-catalog", null, null,
            "{\"productId\":\"" + productId + "\",\"qty\":1}"));
        assertThat(reply.status()).isEqualTo(200);
        assertThat(reply.body()).contains("\"unitPrice\":0");
        assertThat(reply.body()).contains("\"unavailable\":true");
    }

    @Test
    void addItemVariantOutOfStockIs409UnlessAllowOos() throws Exception {
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        stubCatalogProduct("variant-item", "Variant Item", 2000000, variantId, 0);
        INVENTORY_WIREMOCK.stubFor(get(urlPathEqualTo("/inventory/availability"))
            .withQueryParam("variantIds", equalTo(variantId.toString()))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("[{\"variantId\":\"" + variantId + "\",\"available\":0}]")));

        Reply conflict = send(req("POST", "/api/cart/items?slug=variant-item", null, null,
            "{\"productId\":\"" + productId + "\",\"variantId\":\"" + variantId + "\",\"qty\":1}"));
        assertThat(conflict.status()).isEqualTo(409);
        assertThat(conflict.body()).contains("out_of_stock");

        Reply allowOos = send(req("POST", "/api/cart/items?slug=variant-item", null, null,
            "{\"productId\":\"" + productId + "\",\"variantId\":\"" + variantId
                + "\",\"qty\":1,\"allowOos\":true}"));
        assertThat(allowOos.status()).isEqualTo(200);
        assertThat(allowOos.body()).contains("\"unavailable\":true");
    }

    @Test
    void invalidTokenIs401FailClosed() throws Exception {
        Reply reply = send(req("GET", "/api/cart", "not-a-jwt", null, null));
        assertThat(reply.status()).isEqualTo(401);
    }

    // ── PATCH / DELETE ─────────────────────────────────────────────────────

    @Test
    void patchAndRemoveLineLifecycle() throws Exception {
        UUID productId = UUID.randomUUID();
        stubCatalogProduct("lifecycle-item", "Lifecycle Item", 300000, null, 0);
        Reply add = send(req("POST", "/api/cart/items?slug=lifecycle-item", null, null,
            "{\"productId\":\"" + productId + "\",\"qty\":1}"));
        String cookie = add.setCookie().orElseThrow().split(";")[0];
        String lineId = com.jayway.jsonpath.JsonPath.read(add.body(), "$.items[0].id");

        Reply patched = send(req("PATCH", "/api/cart/items/" + lineId, null, cookie,
            "{\"qty\":5}"));
        assertThat(patched.status()).isEqualTo(200);
        assertThat(patched.body()).contains("\"qty\":5");
        assertThat(patched.body()).contains("\"subtotal\":1500000");

        Reply zeroQty = send(req("PATCH", "/api/cart/items/" + lineId, null, cookie,
            "{\"qty\":0}"));
        assertThat(zeroQty.status()).isEqualTo(400);

        Reply removed = send(req("DELETE", "/api/cart/items/" + lineId, null, cookie, null));
        assertThat(removed.status()).isEqualTo(200);
        assertThat(removed.body()).contains("\"items\":[]");

        Reply gone = send(req("PATCH", "/api/cart/items/" + lineId, null, cookie,
            "{\"qty\":1}"));
        assertThat(gone.status()).isEqualTo(404);
    }

    @Test
    void patchQtyClampsBeforeStockCheck() throws Exception {
        // code-review P2 regression: clamp 99 chạy TRƯỚC check stock — patch
        // 150 với stock 120 → qty hiệu dụng 99 ≤ 120 → 200, KHÔNG 409 oan.
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        stubCatalogProduct("clamp-item", "Clamp Item", 10000, variantId, 0);
        INVENTORY_WIREMOCK.stubFor(get(urlPathEqualTo("/inventory/availability"))
            .withQueryParam("variantIds", equalTo(variantId.toString()))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("[{\"variantId\":\"" + variantId + "\",\"available\":120}]")));

        Reply add = send(req("POST", "/api/cart/items?slug=clamp-item", null, null,
            "{\"productId\":\"" + productId + "\",\"variantId\":\"" + variantId + "\",\"qty\":1}"));
        String cookie = add.setCookie().orElseThrow().split(";")[0];
        String lineId = com.jayway.jsonpath.JsonPath.read(add.body(), "$.items[0].id");

        Reply clamped = send(req("PATCH", "/api/cart/items/" + lineId, null, cookie,
            "{\"qty\":150}"));
        assertThat(clamped.status()).isEqualTo(200);
        assertThat(clamped.body()).contains("\"qty\":99");

        // vượt thật sự: stock 120 < 150 → 409 (clamp không giấu 409 thật)
        INVENTORY_WIREMOCK.stubFor(get(urlPathEqualTo("/inventory/availability"))
            .withQueryParam("variantIds", equalTo(variantId.toString()))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("[{\"variantId\":\"" + variantId + "\",\"available\":3}]")));
        Reply overStock = send(req("PATCH", "/api/cart/items/" + lineId, null, cookie,
            "{\"qty\":150}"));
        assertThat(overStock.status()).isEqualTo(409);
    }
}
