package com.ecommerce.notification.stockalert;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Client gọi catalog internal stock-alert API TRỰC TIẾP :8082 (không qua
 * gateway) kèm X-Internal-Token (pattern InvoiceClient). Lỗi → list rỗng
 * (scheduler tick sau thử lại — không chết vòng).
 */
@Component
public class CatalogStockAlertClient {

    private static final Logger log = LoggerFactory.getLogger(CatalogStockAlertClient.class);

    /** Khớp StockAlertService.Candidate (catalog). */
    public record Candidate(UUID alertId, String email, String productId, String slug,
                            String productName, String variantName) {}

    private final RestClient rest;

    public CatalogStockAlertClient(StockAlertProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(java.time.Duration.ofMillis(props.catalog().timeoutMs()));
        factory.setReadTimeout(java.time.Duration.ofMillis(props.catalog().timeoutMs()));
        this.rest = RestClient.builder()
            .requestFactory(factory)
            .baseUrl(props.catalog().baseUrl())
            .defaultHeader("X-Internal-Token", props.catalog().internalToken())
            .build();
    }

    /** ACTIVE alerts của variant vừa có hàng. */
    public List<Candidate> candidates(int limit) {
        try {
            JsonNode body = rest.get()
                .uri("/api/catalog/internal/stock-alerts/candidates?limit=" + limit)
                .retrieve()
                .body(JsonNode.class);
            return parse(body);
        } catch (Exception e) {
            log.warn("[stock-alert] candidates lỗi: {}", e.getMessage());
            return List.of();
        }
    }

    /** Claim atomic — trả các alert catalog flip thành công (đúng 1 lần). */
    public List<Candidate> claim(List<Candidate> candidates) {
        if (candidates.isEmpty()) return List.of();
        // body = object {ids:[...]} khớp ClaimRequest (bare array → 400)
        String ids = candidates.stream()
            .map(c -> "\"" + c.alertId() + "\"")
            .collect(Collectors.joining(",", "{\"ids\":[", "]}"));
        try {
            JsonNode body = rest.post()
                .uri("/api/catalog/internal/stock-alerts/claim")
                .contentType(MediaType.APPLICATION_JSON)
                .body(ids)
                .retrieve()
                .body(JsonNode.class);
            return parse(body);
        } catch (Exception e) {
            log.warn("[stock-alert] claim lỗi: {}", e.getMessage());
            return List.of();
        }
    }

    private List<Candidate> parse(JsonNode body) {
        List<Candidate> out = new ArrayList<>();
        if (body != null && body.isArray()) {
            for (JsonNode item : body) {
                String alertId = item.path("alertId").asText(null);
                String email = item.path("email").asText(null);
                if (alertId == null || email == null) continue;
                out.add(new Candidate(
                    UUID.fromString(alertId),
                    email,
                    item.path("productId").asText(""),
                    item.path("slug").asText(""),
                    item.path("productName").asText(""),
                    item.path("variantName").asText("")));
            }
        }
        return out;
    }
}
