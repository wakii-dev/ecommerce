package com.ecommerce.ordering.saga;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.UUID;

/**
 * Command edge ordering → affiliate (SF-14, D22): trừ điểm loyalty lúc
 * checkout — path FROZEN affiliate.yaml {@code /api/affiliate/internal/loyalty/redeem}
 * (x-internal-only, gọi thẳng :8092 KHÔNG qua gateway; auth X-Internal-Token,
 * quyết định spec D8). 409 từ affiliate → {@link com.ecommerce.ordering.api.PointsInvalidException}
 * (422 cho client); lỗi hạ tầng → RestClientException ném tiếp (saga compensation).
 */
@Component
public class LoyaltyClient {

    private final RestClient rest;
    private final String token;

    public LoyaltyClient(
        RestClient.Builder builder,
        @Value("${ordering.loyalty.base-url:http://localhost:8092}") String baseUrl,
        @Value("${ordering.loyalty.internal-token:dev-internal-token}") String token,
        @Value("${ordering.loyalty.timeout-ms:5000}") long timeoutMs
    ) {
        this.token = token;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) timeoutMs);
        factory.setReadTimeout((int) timeoutMs);
        this.rest = builder.requestFactory(factory).baseUrl(baseUrl).build();
    }

    public record RedeemResult(long discount, long remaining) {
    }

    public RedeemResult redeem(UUID userId, long points, String orderId) {
        try {
            return rest.post()
                .uri("/api/affiliate/internal/loyalty/redeem")
                .header("X-Internal-Token", token)
                .body(new RedeemBody(userId.toString(), points, orderId))
                .retrieve()
                .body(RedeemResult.class);
        } catch (HttpClientErrorException.Conflict e) {
            // 409 = điểm không đủ hoặc đơn đã redeem (contract affiliate.yaml)
            throw new com.ecommerce.ordering.api.PointsInvalidException(
                "Không dùng được điểm cho đơn này — điểm không đủ hoặc đã dùng");
        }
    }

    record RedeemBody(String userId, long points, String orderId) {
    }
}
