package com.ecommerce.cart;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;

import com.ecommerce.cart.store.CartStore;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Merge-on-login (SF-6 Task 4) — JWT + cartToken → gộp qty cùng line identity,
 * xóa giỏ guest, expire cookie; 401 guest; 404 token lạ; 400 thiếu token.
 */
class MergeCartTest extends AbstractCartIntegrationTest {

    @LocalServerPort
    int port;

    @Autowired
    CartStore store;

    private final HttpClient http = HttpClient.newHttpClient();

    private String base() {
        return "http://localhost:" + port;
    }

    private record Reply(int status, String body, String setCookie) {
    }

    private Reply send(HttpRequest request) throws Exception {
        HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
        return new Reply(res.statusCode(), res.body(), res.headers().firstValue("Set-Cookie").orElse(null));
    }

    private HttpRequest req(String method, String path, String bearer, String cookie, String body) {
        HttpRequest.Builder b = HttpRequest.newBuilder().uri(URI.create(base() + path));
        if (bearer != null) b.header("Authorization", "Bearer " + bearer);
        if (cookie != null) b.header("Cookie", cookie);
        b.header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        return b.build();
    }

    private void stubCatalog(String slug, String name, long price) {
        CATALOG_WIREMOCK.stubFor(get(urlEqualTo("/api/catalog/products/" + slug))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("{\"name\":\"" + name + "\",\"image\":{\"url\":\"https://img.test/x.webp\"},"
                    + "\"price\":" + price + "}")));
    }

    /** Add qua API guest (cookie = null → auto-create, trả cookie mới). */
    private String addItem(String slug, UUID productId, int qty, String cookie) throws Exception {
        stubCatalog(slug, "Sản phẩm " + slug, 100000);
        Reply add = send(req("POST", "/api/cart/items?slug=" + slug, null, cookie,
            "{\"productId\":\"" + productId + "\",\"qty\":" + qty + "}"));
        assertThat(add.status()).isEqualTo(200);
        return cookie != null ? cookie
            : add.setCookie().split(";")[0]; // "cart_token=<uuid>"
    }

    @Test
    void mergeDedupesQtyAndInvalidatesGuest() throws Exception {
        UUID sharedProduct = UUID.randomUUID();
        UUID otherProduct = UUID.randomUUID();
        String guestCookie = addItem("merge-shared", sharedProduct, 2, null);
        addItem("merge-other", otherProduct, 1, guestCookie); // CÙNG giỏ guest (mang cookie)
        String guestToken = guestCookie.substring("cart_token=".length());

        // User có sẵn 1 line TRÙNG productId với guest line 1 → merge cộng qty
        String bearer = mintToken("user-merge-1");
        stubCatalog("merge-shared", "Sản phẩm merge-shared", 100000);
        Reply add = send(req("POST", "/api/cart/items?slug=merge-shared", bearer, null,
            "{\"productId\":\"" + sharedProduct + "\",\"qty\":1}"));
        assertThat(add.status()).isEqualTo(200);

        Reply merged = send(req("POST", "/api/cart/merge", bearer, guestCookie,
            "{\"cartToken\":\"" + guestToken + "\"}"));
        assertThat(merged.status()).isEqualTo(200);
        assertThat(merged.body()).contains("\"qty\":3"); // 1 (user) + 2 (guest) gộp
        assertThat(merged.body()).contains("\"qty\":1"); // line riêng của guest vẫn còn
        assertThat(merged.setCookie()).contains("Max-Age=0"); // expire cookie guest
        assertThat(store.load(CartStore.guestKey(guestToken))).isEmpty(); // guest key đã xóa
    }

    @Test
    void mergeWithoutJwtIs401() throws Exception {
        Reply reply = send(req("POST", "/api/cart/merge", null, null,
            "{\"cartToken\":\"whatever\"}"));
        assertThat(reply.status()).isEqualTo(401);
    }

    @Test
    void mergeUnknownTokenIs404() throws Exception {
        Reply reply = send(req("POST", "/api/cart/merge", mintToken("user-merge-404"), null,
            "{\"cartToken\":\"" + UUID.randomUUID() + "\"}"));
        assertThat(reply.status()).isEqualTo(404);
        assertThat(reply.body()).contains("guest_cart_not_found");
    }

    @Test
    void mergeWithoutTokenAnywhereIs400() throws Exception {
        Reply reply = send(req("POST", "/api/cart/merge", mintToken("user-merge-400"), null,
            "{}"));
        assertThat(reply.status()).isEqualTo(400);
        assertThat(reply.body()).contains("cartToken");
    }
}
