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
 * CatalogClient — client thuần (KHÔNG cần Spring context). UUID-lookup đi
 * public by-id (SF-4/FI-408 — GAP-3 admin-token đã xóa): 200 → node;
 * 404 → null (không tìm thấy); catalog 5xx → 502 BAD_GATEWAY.
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

    private CatalogClient client() {
        PartnerProperties props = new PartnerProperties(
            new PartnerProperties.Identity("http://identity", 1000),
            new PartnerProperties.ServiceAccount("e@x", "p", "n"),
            new PartnerProperties.Ordering("http://ordering", 1000),
            new PartnerProperties.Catalog(WIRE.baseUrl(), 2000),
            new PartnerProperties.Webhook(100, 3, 200));
        return new CatalogClient(RestClient.builder(), props);
    }

    @Test
    void byId_publicPath_ok() {
        String id = UUID.randomUUID().toString();
        WIRE.stubFor(get(urlEqualTo("/api/catalog/products/by-id/" + id))
            .willReturn(okJson("{\"id\":\"" + id + "\",\"slug\":\"s\",\"name\":\"N\",\"price\":1000}")));
        JsonNode product = client().productById(id);
        assertThat(product.path("name").asText()).isEqualTo("N");
        assertThat(product.path("id").asText()).isEqualTo(id);
    }

    @Test
    void byId_publicPath_catalog404_isNull() {
        String id = UUID.randomUUID().toString();
        WIRE.stubFor(get(urlEqualTo("/api/catalog/products/by-id/" + id))
            .willReturn(aResponse().withStatus(404)));
        assertThat(client().productById(id)).isNull();
    }

    @Test
    void byId_publicPath_catalog500_is502() {
        String id = UUID.randomUUID().toString();
        WIRE.stubFor(get(urlEqualTo("/api/catalog/products/by-id/" + id))
            .willReturn(aResponse().withStatus(500)));
        assertThatThrownBy(() -> client().productById(id))
            .isInstanceOf(ResponseStatusException.class)
            .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
            .isEqualTo(502);
    }
}
