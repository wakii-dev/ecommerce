package com.ecommerce.partner.proxy;

import com.ecommerce.partner.config.PartnerProperties;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriBuilder;

import java.net.URI;
import java.util.function.Function;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;

/**
 * Proxy đọc catalog (REST trực tiếp :8082 — public GET permitAll, KHÔNG cần
 * token; path giữ full prefix /api/catalog/**). Admin-by-id chỉ dùng cho
 * partner path UUID-shaped (GAP-3 interim): token rỗng → 502 với detail
 * "dùng slug"; catalog 401/403 (token hỏng) → 502 config-broken; 404 → null.
 */
@Component
public class CatalogClient {

    private static final Logger log = LoggerFactory.getLogger(CatalogClient.class);

    private final RestClient rest;
    private final String adminToken;

    public CatalogClient(RestClient.Builder builder, PartnerProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) props.catalog().timeoutMs());
        factory.setReadTimeout((int) props.catalog().timeoutMs());
        RestClient.Builder b = builder.requestFactory(factory).baseUrl(props.catalog().baseUrl());
        this.adminToken = props.catalog().adminToken();
        if (adminToken != null && !adminToken.isBlank()) {
            b.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        }
        this.rest = b.build();
    }

    public boolean adminTokenConfigured() {
        return adminToken != null && !adminToken.isBlank();
    }

    /** GET /api/catalog/products — trả page {items,page,size,total} hoặc 502. */
    public JsonNode listProducts(int page, int size, String category) {
        return get(builder -> {
            var spec = builder.path("/api/catalog/products")
                .queryParam("page", Math.max(1, page))
                .queryParam("size", clampSize(size));
            if (category != null && !category.isBlank()) {
                spec.queryParam("category", category);
            }
            return spec.build();
        });
    }

    /** GET /api/catalog/search — q bắt buộc (controller đã validate trước). */
    public JsonNode search(String q, int page, int size) {
        return get(builder -> builder.path("/api/catalog/search")
            .queryParam("q", q)
            .queryParam("page", Math.max(1, page))
            .queryParam("size", clampSize(size))
            .build());
    }

    /** GET /api/catalog/categories — cây (controller tự flatten). */
    public JsonNode categories() {
        return get(builder -> builder.path("/api/catalog/categories").build());
    }

    /** GET /api/catalog/products/{slug} — null khi 404 (không tìm thấy). */
    public JsonNode productBySlug(String slug) {
        try {
            return rest.get().uri("/api/catalog/products/{slug}", slug).retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException.NotFound e) {
            return null;
        } catch (RestClientException e) {
            throw upstream("Catalog không trả lời được khi lấy product", e);
        }
    }

    /**
     * GET /api/catalog/admin/products/{id} — UUID path (GAP-3 interim).
     * Token chưa cấu hình → 502 (ops-visible, nhắn "dùng slug"); token hỏng
     * (401/403) → 502; không thấy (404) → null.
     */
    public JsonNode productById(String id) {
        if (!adminTokenConfigured()) {
            throw new ResponseStatusException(BAD_GATEWAY,
                "Tra cứu product theo UUID chưa được cấu hình trên platform — hãy dùng slug (/open-api/v1/products/{slug})");
        }
        try {
            return rest.get().uri("/api/catalog/admin/products/{id}", id).retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException.NotFound e) {
            return null;
        } catch (HttpClientErrorException.Unauthorized | HttpClientErrorException.Forbidden e) {
            log.error("Catalog admin token bị từ chối ({} {}) — CATALOG_API_TOKEN cấu hình sai/hết hạn",
                e.getStatusCode(), e.getMessage());
            throw upstream("Platform misconfiguration — không đọc được catalog theo UUID", e);
        } catch (RestClientException e) {
            throw upstream("Catalog không trả lời được khi lấy product", e);
        }
    }

    private JsonNode get(Function<UriBuilder, URI> spec) {
        try {
            return rest.get().uri(spec).retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException.NotFound e) {
            // list/search/categories không có 404 thật — coi rỗng
            return null;
        } catch (RestClientException e) {
            throw upstream("Catalog không trả lời được", e);
        }
    }

    private static int clampSize(int size) {
        return Math.min(Math.max(1, size), 100);
    }

    private static ResponseStatusException upstream(String message, Exception cause) {
        log.error("{}: {}", message, cause.getMessage());
        return new ResponseStatusException(BAD_GATEWAY, message);
    }
}
