package com.ecommerce.partner.proxy;

import com.ecommerce.partner.config.PartnerProperties;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;

/**
 * Gọi ordering saga (REST trực tiếp :8085 — controller map path GỐC /orders,
 * /me/orders/{id}). Đơn tạo bằng service-account JWT (GAP-1 interim) +
 * Idempotency-Key deterministic từ (partnerId, partnerRef) — layer 2.
 *
 * <p>401 từ ordering → token rớt giữa chừng: refresh token identity + retry
 * ĐÚNG 1 LẦN (guard vòng lặp). Lỗi khác ném nguyên trạng cho
 * PartnerOrderService map sang contract partner.</p>
 */
@Component
public class OrderingClient {

    private static final Logger log = LoggerFactory.getLogger(OrderingClient.class);

    private final RestClient rest;
    private final IdentityClient identity;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public OrderingClient(RestClient.Builder builder, PartnerProperties props, IdentityClient identity,
                          com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) props.ordering().timeoutMs());
        factory.setReadTimeout((int) props.ordering().timeoutMs());
        this.rest = builder.requestFactory(factory)
            .baseUrl(props.ordering().baseUrl())
            .build();
        this.identity = identity;
        this.objectMapper = objectMapper;
    }

    /**
     * POST /orders — trả JsonNode CreateOrderResponse {order:{...}, clientSecret}.
     * 401 (token hết hạn) được retry ngầm 1 lần; 409/422/400/5xx ném
     * HttpClientErrorException cho caller map.
     *
     * <p>Body gửi qua BYTE[] + header Content-Type KHÔNG charset: RestClient
     * + Jackson tự thêm {@code ;charset=UTF-8} → ordering trả 415
     * HttpMediaTypeNotSupportedException (bug 07/09 — ordering chỉ chấp nhận
     * "application/json" đúng nguyên văn).</p>
     */
    public JsonNode createOrder(String idempotencyKey, JsonNode createOrderRequest) {
        return callWithTokenRetry(() -> {
            byte[] payload;
            try {
                payload = objectMapper.writeValueAsBytes(createOrderRequest);
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException("Không serialize được order body", e);
            }
            return rest.post()
                .uri("/orders")
                .header(HttpHeaders.AUTHORIZATION, bearer())
                .header("Idempotency-Key", idempotencyKey)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .body(payload)
                .retrieve()
                .body(JsonNode.class);
        });
    }

    /** GET /me/orders/{id} — null khi 404. */
    public JsonNode getOrder(String orderId) {
        try {
            return callWithTokenRetry(() -> rest.get()
                .uri("/me/orders/{id}", orderId)
                .header(HttpHeaders.AUTHORIZATION, bearer())
                .retrieve()
                .body(JsonNode.class));
        } catch (HttpClientErrorException.NotFound e) {
            return null;
        }
    }

    private interface Call {
        JsonNode run();
    }

    private JsonNode callWithTokenRetry(Call call) {
        try {
            return call.run();
        } catch (HttpClientErrorException.Unauthorized e) {
            // token rớt giữa chừng — ép login lại rồi thử ĐÚNG 1 lần
            log.info("[ordering] 401 — refresh service-account token, retry 1 lần");
            identity.getAccessToken();
            return call.run();
        } catch (RestClientException e) {
            throw e;
        }
    }

    private String bearer() {
        return "Bearer " + identity.getAccessToken();
    }

    /** Map lỗi hạ tầng ordering → 502 (contract partner không có 5xx Ordering). */
    public static ResponseStatusException unavailable(Exception cause) {
        log.error("Ordering không trả lời được: {}", cause.getMessage());
        return new ResponseStatusException(BAD_GATEWAY, "Hệ thống xử lý đơn tạm bận — thử lại sau");
    }
}
