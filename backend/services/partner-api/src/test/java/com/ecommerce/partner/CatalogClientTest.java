package com.ecommerce.partner;

import com.ecommerce.partner.config.PartnerProperties;
import com.ecommerce.partner.proxy.CatalogClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Ma trận token admin-by-id (GAP-3) — KHÔNG cần Spring context: CatalogClient
 * là client thuần. Token rỗng → 502 nhắn "slug"; token hỏng (401/403) → 502;
 * catalog 404 → null (không tìm thấy). Khỏi IT chính (context token rỗng).
 */
class CatalogClientTest {

    static final WireMockServer WIRE = new WireMockServer(options().dynamicPort());

    @BeforeAll
    static void start() {
        WIRE.start();
    }

    @AfterAll
    static void stop() {
        WIRE.stop();
    }

    private CatalogClient client(String adminToken) {
        PartnerProperties props = new PartnerProperties(
            new PartnerProperties.Identity("http://identity", 1000),
            new PartnerProperties.ServiceAccount("e@x", "p", "n"),
            new PartnerProperties.Ordering("http://ordering", 1000),
            new PartnerProperties.Catalog(WIRE.baseUrl(), adminToken, 2000),
            new PartnerProperties.Webhook(100, 3, 200));
        return new CatalogClient(RestClient.builder(), props);
    }

    @Test
    void byIdWithoutToken_is502WithSlugGuidance() {
        assertThatThrownBy(() -> client("").productById(UUID.randomUUID().toString()))
            .isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getReason()).contains("slug"));
    }

    @Test
    void byIdWithToken_ok() {
        WIRE.stubFor(get(urlEqualTo("/api/catalog/admin/products/abc"))
            .willReturn(okJson("{\"id\":\"abc\",\"slug\":\"s\",\"name\":\"N\",\"price\":1000}")));
        JsonNode product = client("tok").productById("abc");
        assertThat(product.path("name").asText()).isEqualTo("N");
    }

    @Test
    void byIdWithToken_catalog404_isNull() {
        WIRE.stubFor(get(urlEqualTo("/api/catalog/admin/products/gone"))
            .willReturn(aResponse().withStatus(404)));
        assertThat(client("tok").productById("gone")).isNull();
    }

    @Test
    void byIdWithToken_catalogRejectsToken_is502() {
        WIRE.stubFor(get(urlEqualTo("/api/catalog/admin/products/bad"))
            .willReturn(aResponse().withStatus(403)));
        assertThatThrownBy(() -> client("expired").productById("bad"))
            .isInstanceOf(ResponseStatusException.class)
            .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
            .isEqualTo(502);
    }
}
