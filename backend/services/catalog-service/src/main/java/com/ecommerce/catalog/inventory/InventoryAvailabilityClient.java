package com.ecommerce.catalog.inventory;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Client tồn kho (SF-15): GET /inventory/availability?variantIds=... — service
 * nội bộ inventory (:8084, KHÔNG qua gateway, path gốc /inventory/*). Lỗi
 * mạng/5xx → Map RỖNG (nghĩa "không xác minh được": register cho phép,
 * candidates trả rỗng) — không làm chết luồng chính.
 */
@Component
public class InventoryAvailabilityClient {

    private static final Logger log = LoggerFactory.getLogger(InventoryAvailabilityClient.class);

    private final RestClient rest;

    public InventoryAvailabilityClient(@Value("${inventory.base-url:http://localhost:8084}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(800);
        factory.setReadTimeout(1500);
        this.rest = RestClient.builder().requestFactory(factory).baseUrl(baseUrl).build();
    }

    /** variantId → available. Map rỗng = inventory chết (không có dữ liệu). */
    public Map<UUID, Integer> availability(Collection<UUID> variantIds) {
        if (variantIds.isEmpty()) return Map.of();
        String ids = variantIds.stream().map(UUID::toString).collect(Collectors.joining(","));
        try {
            JsonNode body = rest.get()
                .uri("/inventory/availability?variantIds=" + ids)
                .retrieve()
                .body(JsonNode.class);
            Map<UUID, Integer> out = new HashMap<>();
            if (body != null && body.isArray()) {
                for (JsonNode item : body) {
                    String variantId = item.path("variantId").asText(null);
                    if (variantId != null) {
                        out.put(UUID.fromString(variantId), item.path("available").asInt(0));
                    }
                }
            }
            return out;
        } catch (Exception e) {
            log.warn("[stock-alert] inventory availability lỗi: {}", e.getMessage());
            return Map.of();
        }
    }
}
