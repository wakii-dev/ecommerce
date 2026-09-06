package com.ecommerce.cart;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Removed-product filter + enrichment (SF-6 Task 5, §6.1.2) — GET refresh
 * snapshot từ catalog; product gỡ/draft → unavailable=true GIỮ item (cart
 * KHÔNG tự xóa); subtotal chỉ tính item khả dụng; inventory OOS variant →
 * unavailable; catalog sống lại → item phục hồi (unavailable=false).
 */
class CartEnrichmentTest extends AbstractCartIntegrationTest {

    @LocalServerPort
    int port;

    private final HttpClient http = HttpClient.newHttpClient();

    private record Reply(int status, String body, String cookie) {
    }

    private Reply send(HttpRequest request) throws Exception {
        HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
        return new Reply(res.statusCode(), res.body(), res.headers().firstValue("Set-Cookie").orElse(null));
    }

    private HttpRequest req(String method, String path, String cookie, String body) {
        HttpRequest.Builder b = HttpRequest.newBuilder().uri(URI.create("http://localhost:" + port + path));
        if (cookie != null) b.header("Cookie", cookie);
        b.header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        return b.build();
    }

    private void stubCatalog(String slug, String name, long price) {
        CATALOG_WIREMOCK.stubFor(get(urlEqualTo("/api/catalog/products/" + slug))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("{\"name\":\"" + name + "\",\"image\":{\"url\":\"https://img.test/" + slug
                    + ".webp\"},\"price\":" + price + "}")));
    }

    private void stubCatalog404(String slug) {
        CATALOG_WIREMOCK.stubFor(get(urlEqualTo("/api/catalog/products/" + slug))
            .willReturn(aResponse().withStatus(404)));
    }

    @Test
    void unpublishAfterAddMarksUnavailableKeepsItemAndExcludesFromSubtotal() throws Exception {
        UUID productId = UUID.randomUUID();
        stubCatalog("unpub-item", "Unpub Item", 250000);
        Reply add = send(req("POST", "/api/cart/items?slug=unpub-item", null,
            "{\"productId\":\"" + productId + "\",\"qty\":2}"));
        String cookie = add.cookie().split(";")[0];

        // Admin gỡ/draft product → catalog 404
        stubCatalog404("unpub-item");
        Reply after = send(req("GET", "/api/cart", cookie, null));
        assertThat(after.status()).isEqualTo(200);
        assertThat(after.body()).contains("\"unavailable\":true");     // item vẫn giữ
        assertThat(after.body()).contains("\"items\":[{");             // không tự xóa
        assertThat(after.body()).contains("\"name\":\"Unpub Item\""); // giữ snapshot tên
        assertThat(after.body()).contains("\"subtotal\":0");           // loại khỏi subtotal

        // Catalog sống lại (publish trở lại) → item phục hồi
        stubCatalog("unpub-item", "Unpub Item", 250000);
        Reply restored = send(req("GET", "/api/cart", cookie, null));
        assertThat(restored.body()).contains("\"unavailable\":false");
        assertThat(restored.body()).contains("\"subtotal\":500000");
    }

    @Test
    void priceChangeReflectsOnGet() throws Exception {
        UUID productId = UUID.randomUUID();
        stubCatalog("price-item", "Price Item", 100000);
        Reply add = send(req("POST", "/api/cart/items?slug=price-item", null,
            "{\"productId\":\"" + productId + "\",\"qty\":1}"));
        String cookie = add.cookie().split(";")[0];

        stubCatalog("price-item", "Price Item (đổi tên)", 150000);
        Reply after = send(req("GET", "/api/cart", cookie, null));
        assertThat(after.body()).contains("\"unitPrice\":150000");
        assertThat(after.body()).contains("đổi tên");
    }

    @Test
    void variantOutOfStockMarksUnavailable() throws Exception {
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        // catalog trả variant (priceDelta 0) + inventory báo available 0
        CATALOG_WIREMOCK.stubFor(get(urlEqualTo("/api/catalog/products/oos-variant"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("{\"name\":\"OOS Variant\",\"image\":null,\"price\":500000,"
                    + "\"variants\":[{\"id\":\"" + variantId + "\",\"priceDelta\":0}]}")));
        INVENTORY_WIREMOCK.stubFor(get(urlPathEqualTo("/inventory/availability"))
            .withQueryParam("variantIds", equalTo(variantId.toString()))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("[{\"variantId\":\"" + variantId + "\",\"available\":0}]")));

        // add cần allowOos (available=0 → không allowOos đã 409 ở add)
        Reply add = send(req("POST", "/api/cart/items?slug=oos-variant", null,
            "{\"productId\":\"" + productId + "\",\"variantId\":\"" + variantId
                + "\",\"qty\":1,\"allowOos\":true}"));
        assertThat(add.status()).isEqualTo(200);

        Reply get = send(req("GET", "/api/cart", add.cookie().split(";")[0], null));
        assertThat(get.body()).contains("\"unavailable\":true");
        assertThat(get.body()).contains("\"subtotal\":0");
    }
}
