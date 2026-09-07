package com.ecommerce.catalog.reviews.seedtool;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import com.ecommerce.catalog.config.RabbitMqConfig;
import com.ecommerce.common.event.EventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * ReviewSeedTool (SF-8, pack mục 5 + spec Q10) — publish synthetic
 * {@code order.confirmed} ĐÚNG schema SF-2 vào RabbitMQ để demo verified
 * flow KHÔNG cần ordering-service. Gated: profile {@code test} TUYỆT ĐỜI
 * không tự chạy (ApplicationRunner chỉ no-op trừ khi 2 điều kiện đều đúng):
 *
 * <pre>
 * SPRING_PROFILES_ACTIVE=test java -jar catalog-service.jar \
 *   --catalog.review-seed.enabled=true \
 *   --catalog.review-seed.user-id=&lt;uuid user A&gt; \
 *   --catalog.review-seed.product-id=&lt;uuid product X&gt;[,&lt;uuid Y&gt;...] \
 *   [--catalog.review-seed.order-id=&lt;uuid&gt;]
 * </pre>
 *
 * <p>Payload khít {@code contracts/events/order.confirmed.schema.json}
 * (fat §6.1.5): consumer catalog đọc items productId/userId — các field còn
 * lại (email/tổng tiền) điền hợp lệ cho schema-valid dù consumer bỏ qua.</p>
 */
@Component
public class ReviewSeedTool implements ApplicationRunner {

    static final String PROP_ENABLED = "catalog.review-seed.enabled";
    static final String PROP_USER_ID = "catalog.review-seed.user-id";
    static final String PROP_PRODUCT_ID = "catalog.review-seed.product-id";
    static final String PROP_ORDER_ID = "catalog.review-seed.order-id";

    private final AmqpTemplate amqpTemplate;
    private final ObjectMapper objectMapper;
    private final Environment env;

    public ReviewSeedTool(AmqpTemplate amqpTemplate, ObjectMapper objectMapper, Environment env) {
        this.amqpTemplate = amqpTemplate;
        this.objectMapper = objectMapper;
        this.env = env;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!List.of(env.getActiveProfiles()).contains("test")
            || !"true".equals(env.getProperty(PROP_ENABLED))) {
            return; // no-op — chỉ chạy khi được bật tường minh trong profile test
        }
        String userId = require(PROP_USER_ID);
        String productIds = require(PROP_PRODUCT_ID);
        String orderId = env.getProperty(PROP_ORDER_ID, UUID.randomUUID().toString());
        publish(orderId, userId, List.of(productIds.split(",")));
    }

    /** Publish 1 envelope order.confirmed — 1 đơn, items = mỗi product qty 1. */
    public void publish(String orderId, String userId, List<String> productIds) {
        Map<String, Object> payload = Map.of(
            "orderId", orderId,
            "userId", userId,
            "email", "seed@demo.local",
            "items", productIds.stream().map(pid -> Map.of(
                "productId", pid.trim(),
                "variantId", pid.trim(), // sản phẩm không variant — id đại diện (schema yêu cầu string)
                "qty", 1,
                "price", 0,
                "name", "Synthetic seeded item")).toList(),
            "subtotal", 0,
            "discount", 0,
            "shippingFee", 0,
            "total", 0,
            "currency", "VND",
            "confirmedAt", java.time.Instant.now().toString());

        EventEnvelope envelope = EventEnvelope.of(
            "review-seed-tool", RabbitMqConfig.ROUTING_ORDER_CONFIRMED, "seed-" + orderId,
            objectMapper.valueToTree(payload));
        try {
            amqpTemplate.convertAndSend(RabbitMqConfig.EVENTS_EXCHANGE, RabbitMqConfig.ROUTING_ORDER_CONFIRMED,
                objectMapper.writeValueAsString(envelope));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Không serialize được envelope seed", e);
        }
    }

    private String require(String key) {
        String value = env.getProperty(key);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("ReviewSeedTool bật nhưng thiếu " + key + " — xem javadoc class");
        }
        return value.trim();
    }
}
