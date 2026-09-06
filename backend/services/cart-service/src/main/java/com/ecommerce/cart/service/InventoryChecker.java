package com.ecommerce.cart.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Inventory availability client (SF-6) — check tồn kho VARIANT (§6.1.4) khi
 * add/patch/enrich. Inventory CHỨA StripPrefix ở gateway → controller map
 * {@code /inventory/**} nên gọi trực tiếp không prefix {@code /api}.
 * Lỗi network/5xx → empty map = SKIP check (degraded — cart không chết vì
 * inventory); chỉ 200 mới là dữ liệu thật.
 */
@Component
public class InventoryChecker {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AvailabilityItem(String variantId, int available) {
    }

    private final RestClient rest;

    public InventoryChecker(@Value("${cart.inventory-base-url:http://localhost:8084}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(2).toMillis());
        this.rest = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(factory)
            .build();
    }

    /** Map variantId → available; rỗng khi inventory không trả lời được. */
    public Map<String, Integer> availabilityOf(List<UUID> variantIds) {
        if (variantIds.isEmpty()) {
            return Map.of();
        }
        String joined = variantIds.stream().map(UUID::toString).collect(Collectors.joining(","));
        try {
            List<AvailabilityItem> items = rest.get()
                .uri(b -> b.path("/inventory/availability").queryParam("variantIds", joined).build())
                .retrieve()
                .body(new ParameterizedTypeReference<List<AvailabilityItem>>() {
                });
            if (items == null) {
                return Map.of();
            }
            return items.stream()
                .filter(i -> i.variantId() != null)
                .collect(Collectors.toMap(AvailabilityItem::variantId, AvailabilityItem::available,
                    (a, b) -> Math.min(a, b))); // trùng variant → cautious lấy min
        } catch (Exception e) {
            return Map.of();
        }
    }
}
