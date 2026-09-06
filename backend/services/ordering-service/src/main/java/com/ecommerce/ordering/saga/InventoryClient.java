package com.ecommerce.ordering.saga;

import com.ecommerce.ordering.api.InsufficientStockDto;
import com.ecommerce.ordering.api.InsufficientStockException;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Command edge ordering → inventory (§3.2 pin: sync REST): POST /reservations
 * all-or-nothing. 409 có {@code insufficient[]} → đóng gói thành
 * {@link InsufficientStockException} để handler trả 409 đúng contract
 * CreateOrderConflictError; lỗi hạ tầng khác → saga compensation 502.
 *
 * <p>Path service KHÔNG mang prefix /api (inventory dùng gateway StripPrefix=1
 * — inventory ReservationController map "/inventory").</p>
 */
@Component
public class InventoryClient {

    private final RestClient rest;

    public InventoryClient(
        RestClient.Builder builder,
        @Value("${ordering.inventory.base-url:http://localhost:8084}") String baseUrl,
        @Value("${ordering.inventory.timeout-ms:5000}") long timeoutMs
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) timeoutMs);
        factory.setReadTimeout((int) timeoutMs);
        this.rest = builder.requestFactory(factory).baseUrl(baseUrl).build();
    }

    /** ReservationItem gọn cho REST call — variant level (§6.1.4). */
    public record ReserveItem(UUID variantId, int qty) {
    }

    public record ReservationCreated(String reservationId, String expiresAt) {
    }

    /**
     * @throws InsufficientStockException 409 — hết hàng (compensation + 409 contract)
     * @throws RestClientException        hạ tầng lỗi — saga xử như payment fail (compensation + 502)
     */
    public ReservationCreated reserve(UUID orderId, List<ReserveItem> items) {
        try {
            JsonNode created = rest.post()
                .uri("/inventory/reservations")
                .body(new ReserveBody(orderId.toString(),
                    items.stream().map(i -> new ItemBody(i.variantId().toString(), i.qty())).toList()))
                .retrieve()
                .body(JsonNode.class);
            if (created == null) {
                throw new RestClientException("Inventory trả body rỗng");
            }
            return new ReservationCreated(
                created.path("reservationId").asText(null),
                created.path("expiresAt").asText(null));
        } catch (HttpClientErrorException.Conflict e) {
            throw new InsufficientStockException(parseInsufficient(e.getResponseBodyAsString()));
        }
        // RestClientException khác (500/timeout/connect) ném tiếp — saga compensation.
    }

    /** 409 problem+json: ApiError + insufficient[] — parse tolerance (thiếu → rỗng). */
    private List<InsufficientStockDto> parseInsufficient(String body) {
        List<InsufficientStockDto> result = new ArrayList<>();
        try {
            JsonNode root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
            for (JsonNode item : root.path("insufficient")) {
                result.add(new InsufficientStockDto(
                    item.path("variantId").asText(null),
                    item.path("requested").asLong(0),
                    item.path("available").isNumber() ? item.path("available").asLong() : null));
            }
        } catch (Exception ignored) {
            // body không parse được → danh sách rỗng, vẫn 409 đúng status
        }
        return result;
    }

    private record ReserveBody(String orderId, List<ItemBody> items) {
    }

    private record ItemBody(String variantId, int qty) {
    }
}
