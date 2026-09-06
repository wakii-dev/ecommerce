package com.ecommerce.cart.service;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Catalog client cho enrichment (SF-6) — REWRITE-GAP FIX: catalog KHÔNG có
 * lookup theo productId (chỉ GET /api/catalog/products/{slug}, admin by-id cần
 * ROLE_ADMIN) → cart nhận slug hint từ FE lúc add (query param, additive —
 * ngoài body contract) và enrich qua endpoint public này.
 * REQUIREMENT-GAP đã post lên FI-310 — SF-10 chuyển qua id-lookup khi catalog
 * thêm endpoint internal.
 *
 * <p>Phân biệt 2 kiểu lỗi (pin spec): <strong>404 = product thật sự
 * không tồn tại/draft</strong> (add → reject, enrich → unavailable);
 * <strong>network/5xx = catalog DOWN</strong> (add → nhận item không enrichment,
 * enrich → giữ snapshot).</p>
 */
@Component
public class CatalogEnricher {

    public enum Outcome { OK, PRODUCT_MISSING, CATALOG_DOWN }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ProductView(
            String name,
            ImageRef image,
            long price,
            List<VariantView> variants) {

        public Optional<Long> priceDeltaOf(UUID variantId) {
            if (variantId == null || variants == null) {
                return Optional.empty();
            }
            return variants.stream()
                .filter(v -> variantId.toString().equals(v.id()))
                .findFirst()
                .map(v -> (long) v.priceDelta());
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ImageRef(String url) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record VariantView(String id, int priceDelta) {
    }

    public record Result(Outcome outcome, ProductView product) {
    }

    private final RestClient rest;

    public CatalogEnricher(@Value("${cart.catalog-base-url:http://localhost:8082}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(2).toMillis());
        this.rest = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(factory)
            .build();
    }

    /** GET /api/catalog/products/{slug} — catalog giữ FULL path (gateway không strip, SF-4). */
    public Result fetchBySlug(String slug) {
        try {
            ProductView product = rest.get()
                .uri("/api/catalog/products/{slug}", slug)
                .retrieve()
                .body(ProductView.class);
            if (product == null) {
                return new Result(Outcome.CATALOG_DOWN, null);
            }
            return new Result(Outcome.OK, product);
        } catch (RestClientException e) {
            // 404 (HttpClientErrorException.NotFound) cũng là RestClientException
            // — phân biệt qua status chứ KHÔNG nuốt chung một mối.
            if (e instanceof org.springframework.web.client.HttpClientErrorException http
                && http.getStatusCode().value() == 404) {
                return new Result(Outcome.PRODUCT_MISSING, null);
            }
            return new Result(Outcome.CATALOG_DOWN, null);
        }
    }
}
