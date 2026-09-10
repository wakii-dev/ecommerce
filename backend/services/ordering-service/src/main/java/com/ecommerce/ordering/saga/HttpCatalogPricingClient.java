package com.ecommerce.ordering.saga;

import com.ecommerce.ordering.api.ItemUnavailableException;
import com.ecommerce.ordering.api.PricingUnavailableException;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.UUID;

/**
 * PricingAuthority mặc định — gọi catalog REST (authority §6.1.1).
 *
 * <p>Đường đi: {@code GET {base}{by-id-path}{productId}} — public by-id
 * endpoint của catalog (FI-397; route khai báo trong catalog.yaml từ SF-4
 * contracts-sync). PUBLISHED-only — draft/deleted → 404 →
 * {@link ItemUnavailableException} (path ORDER_FAILED); catalog chết/timeout
 * → {@link PricingUnavailableException} (502).</p>
 *
 * <p>Giá variant = {@code price} gốc + {@code priceDelta} variant (catalog
 * convention — VariantDto.priceDelta là giá override − giá gốc).</p>
 */
@Component
public class HttpCatalogPricingClient implements PricingAuthority {

    private static final Logger log = LoggerFactory.getLogger(HttpCatalogPricingClient.class);

    private final RestClient rest;
    private final String byIdPath;

    public HttpCatalogPricingClient(
        RestClient.Builder builder,
        @Value("${ordering.pricing.base-url:http://localhost:8082}") String baseUrl,
        @Value("${ordering.pricing.by-id-path:/api/catalog/products/by-id/}") String byIdPath,
        @Value("${ordering.pricing.token:}") String token,
        @Value("${ordering.pricing.timeout-ms:5000}") long timeoutMs
    ) {
        this.byIdPath = byIdPath;
        // SimpleClientHttpRequestFactory — đủ cho demo; timeout ngắn để saga
        // fail-fast vào compensation thay vì treo thread request.
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
            new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) timeoutMs);
        factory.setReadTimeout((int) timeoutMs);
        RestClient.Builder b = builder
            .requestFactory(factory)
            .baseUrl(baseUrl);
        if (token != null && !token.isBlank()) {
            b.defaultHeader(org.springframework.http.HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        this.rest = b.build();
    }

    @Override
    public PricedItem price(UUID productId, UUID variantId) {
        JsonNode product;
        try {
            // STRING overload (KHÔNG URI.create): RestClient chỉ áp baseUrl cho
            // uri-template — java.net.URI được dùng AS-IS → URI tương đối +
            // baseUrl → "URI is not absolute" (bug IT lần đầu chạy 6/9).
            product = rest.get()
                .uri(byIdPath + productId)
                .retrieve()
                .body(JsonNode.class);
        } catch (HttpClientErrorException.NotFound e) {
            // 404 — sản phẩm bị xóa/draft (§6.1.2: không đặt được, path ORDER_FAILED)
            throw new ItemUnavailableException("Sản phẩm không còn khả dụng: " + productId);
        } catch (RestClientException e) {
            throw new PricingUnavailableException("Catalog không trả lời được khi re-price: " + e.getMessage());
        }
        if (product == null || product.isNull()) {
            throw new ItemUnavailableException("Sản phẩm không còn khả dụng: " + productId);
        }
        String name = resolveName(product);
        long basePrice = product.path("price").asLong(-1);
        if (basePrice < 0) {
            throw new PricingUnavailableException("Catalog trả payload thiếu price cho " + productId);
        }
        long delta = 0;
        boolean variantFound = false;
        for (JsonNode variant : product.path("variants")) {
            if (variantId.toString().equals(variant.path("id").asText())) {
                delta = variant.path("priceDelta").asLong(0);
                variantFound = true;
                break;
            }
        }
        if (!variantFound) {
            throw new ItemUnavailableException("Variant không còn khả dụng: " + variantId);
        }
        long unitPrice = basePrice + delta;
        if (unitPrice < 0) {
            throw new PricingUnavailableException("Giá variant âm (payload catalog lỗi): " + variantId);
        }
        log.debug("Re-price {}/{} → {} VND ({})", productId, variantId, unitPrice, name);
        return new PricedItem(productId, variantId, name, unitPrice);
    }

    /** Tên resolve: ưu tiên {@code name} (đã resolve vi); fallback {@code nameI18n.vi}. */
    private String resolveName(JsonNode product) {
        String name = product.path("name").asText(null);
        if (name == null || name.isBlank()) {
            name = product.path("nameI18n").path("vi").asText(null);
        }
        return name == null || name.isBlank() ? "Sản phẩm" : name;
    }
}
