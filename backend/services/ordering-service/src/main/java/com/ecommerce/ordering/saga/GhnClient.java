package com.ecommerce.ordering.saga;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;

/**
 * Command edge ordering → GHN (SF-14, D22) — phí theo địa chỉ thật + vận đơn.
 * Degraded (quyết định spec D9): {@code GHN_TOKEN} rỗng → {@link #enabled()}
 * false → mọi path fallback flat-fee/TRK- (pattern PaymentAdapterConfig:
 * non-blank mới bật). IT dùng WireMock phục đúng shape dưới đây.
 *
 * <p>Shape chuẩn hoá (client chiếu về minimal mình dùng — IT deterministic):
 * GHN trả {@code {code, message, data}}; {@code available-services.data[]}
 * có {@code service_id, short_name}; {@code fee.data.total};
 * {@code creates.data.order_code}; {@code detail.data.status, data.log[]}
 * ({@code at, description} — parser chấp nhận các tên field phổ biến của GHN
 * thật: created_at/status/content).</p>
 */
@Component
public class GhnClient {

    private static final Logger log = LoggerFactory.getLogger(GhnClient.class);

    private final RestClient rest;
    private final boolean enabled;
    private final String fromDistrictId;

    public GhnClient(
        RestClient.Builder builder,
        @Value("${ordering.ghn.api-url:https://dev-online-gateway.ghn.vn}") String apiUrl,
        @Value("${ordering.ghn.token:}") String token,
        @Value("${ordering.ghn.shop-id:}") String shopId,
        @Value("${ordering.ghn.from-district-id:1454}") String fromDistrictId,
        @Value("${ordering.ghn.timeout-ms:5000}") long timeoutMs
    ) {
        this.enabled = token != null && !token.isBlank();
        this.fromDistrictId = fromDistrictId;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) timeoutMs);
        factory.setReadTimeout((int) timeoutMs);
        this.rest = builder.requestFactory(factory).baseUrl(apiUrl)
            .defaultHeader("Token", token == null ? "" : token)
            .defaultHeader("ShopId", shopId == null ? "" : shopId)
            .build();
        log.info("GhnClient enabled={} (api-url={})", enabled, apiUrl);
    }

    public boolean enabled() {
        return enabled;
    }

    public record GhnService(long serviceId, String shortName) {
    }

    /** POST /v2/shipping-order/available-services — services chạy được tới district đích. */
    public List<GhnService> availableServices(int toDistrictId) {
        JsonNode data = post("/v2/shipping-order/available-services",
            "{\"to_district_id\":" + toDistrictId + "}");
        List<GhnService> services = new ArrayList<>();
        for (JsonNode item : data) {
            services.add(new GhnService(item.path("service_id").asLong(),
                item.path("short_name").asText("GHN")));
        }
        return services;
    }

    /** POST /v2/shipping-order/fee — phí VND theo service/đích/khối lượng. */
    public long fee(long serviceId, int toDistrictId, int weightGrams) {
        JsonNode data = post("/v2/shipping-order/fee", """
            {"service_id":%d,"to_district_id":%d,"weight":%d,
             "from_district_id":%s}
            """.formatted(serviceId, toDistrictId, weightGrams, fromDistrictIdLiteral()));
        // review P2: 200 thiếu total → throw (fallback flat) thay vì phí 0đ
        if (!data.hasNonNull("total")) {
            throw new IllegalStateException("GHN fee response thiếu total");
        }
        return data.path("total").asLong();
    }

    public record Created(String orderCode) {
    }

    /** POST /v2/shipping-order/creates — mở vận đơn, trả order_code làm trackingCode. */
    public Created createOrder(long serviceId, int toDistrictId, String toWardCode,
                               int weightGrams, String clientOrderCode, String receiverName,
                               String receiverPhone, String address) {
        JsonNode data = post("/v2/shipping-order/creates", """
            {"service_id":%d,"to_district_id":%d,"to_ward_code":"%s","weight":%d,
             "client_order_code":"%s","from_district_id":%s,
             "delivery_pick_option":"delivery",
             "payment_type_id":2,
             "note":"Ecommerce demo",
             "required_note":"KHONGCHOXEMHANG",
             "to_name":"%s","to_phone":"%s","to_address":"%s"}
            """.formatted(serviceId, toDistrictId, toWardCode == null ? "" : escape(toWardCode),
            weightGrams, clientOrderCode, fromDistrictIdLiteral(),
            escape(receiverName), escape(receiverPhone), escape(address)));
        return new Created(data.path("order_code").asText());
    }

    public record Detail(String status, List<Event> events) {
    }

    public record Event(String at, String description) {
    }

    /** POST /v2/shipping-order/detail — trạng thái + lịch sử vận đơn. */
    public Detail detail(String orderCode) {
        JsonNode data = post("/v2/shipping-order/detail",
            "{\"order_code\":\"" + orderCode + "\"}");
        List<Event> events = new ArrayList<>();
        for (JsonNode item : data.path("log")) {
            String at = item.hasNonNull("at") ? item.path("at").asText()
                : item.path("created_at").asText("");
            String description = item.hasNonNull("description") ? item.path("description").asText()
                : item.path("content").asText(item.path("status").asText(""));
            events.add(new Event(at, description));
        }
        return new Detail(data.path("status").asText("unknown"), events);
    }

    /** POST + bóc {@code data}; code != 200 → IllegalStateException (caller fallback). */
    private JsonNode post(String path, String body) {
        JsonNode root = rest.post()
            .uri(path)
            .header("Content-Type", "application/json")
            .body(body)
            .retrieve()
            .body(JsonNode.class);
        if (root == null || root.path("code").asInt(0) != 200) {
            throw new IllegalStateException("GHN " + path + " lỗi: "
                + (root == null ? "empty" : root.path("message").asText("?")));
        }
        return root.path("data");
    }

    private String fromDistrictIdLiteral() {
        return fromDistrictId;
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
