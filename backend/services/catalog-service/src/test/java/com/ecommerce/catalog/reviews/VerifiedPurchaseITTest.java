package com.ecommerce.catalog.reviews;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.listener.RabbitListenerEndpointRegistry;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ecommerce.catalog.ReviewsItHarness;
import com.ecommerce.catalog.config.RabbitMqConfig;
import com.ecommerce.catalog.domain.CategoryEntity;
import com.ecommerce.catalog.domain.I18nText;
import com.ecommerce.catalog.domain.ProductEntity;
import com.ecommerce.catalog.domain.ProductStatus;
import com.ecommerce.catalog.repo.CategoryRepository;
import com.ecommerce.catalog.repo.ProductRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT verified-purchase (SF-8, Task 7 + pack mục 5/IT mục 4): publish synthetic
 * {@code order.confirmed} (user A mua product X) QUA exchange thật
 * {@code ecommerce.events} → consumer insert review_eligibility (idempotent —
 * trùng eventId vẫn 1 row) → review submit của A có verifiedPurchase=true,
 * user B (không mua) = false. RabbitMQ Testcontainer theo pattern
 * {@code CacheInvalidateTest} (chờ log "Server startup complete" — port listen
 * ≠ broker ready).
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
class VerifiedPurchaseITTest extends ReviewsItHarness {

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void rabbit(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        // Consumer thật chạy — override base tắt listener
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "true");
    }

    @Autowired
    CategoryRepository categories;
    @Autowired
    ProductRepository products;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TestRestTemplate http;
    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    RabbitListenerEndpointRegistry rabbitListeners;
    @Autowired
    ObjectMapper om;

    @Test
    void syntheticOrderConfirmedChoVerifiedBadgeVaIdempotent() throws Exception {
        CategoryEntity cat = categories.save(category());
        ProductEntity product = products.save(product(cat));

        startListeners();

        UUID userA = UUID.randomUUID();
        UUID userB = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();

        publishOrderConfirmed(eventId, orderId, userA, product.getId());
        awaitEligibility(userA, product.getId(), 1);

        // A submit review → PENDING không hiện public; admin approve → hiện + badge verified
        submitReview(product.getSlugVi(), userA, "Mua rồi, tốt", 5);
        String pending = getAdminJson("/api/catalog/admin/reviews?status=PENDING");
        assertThat(om.readTree(pending).get("total").asInt()).isEqualTo(1);
        String reviewId = om.readTree(pending).get("items").get(0).get("id").asText();
        approveReview(reviewId);

        String body = http.getForEntity(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + product.getSlugVi() + "/reviews", String.class)
            .getBody();
        var list = om.readTree(body);
        assertThat(list.get("items")).hasSize(1);
        assertThat(list.get("items").get(0).get("verifiedPurchase").asBoolean()).isTrue();

        // Publish TRÙNG eventId (at-least-once redelivery) → vẫn 1 row (marker + ON CONFLICT)
        publishOrderConfirmed(eventId, orderId, userA, product.getId());
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        awaitEligibility(userA, product.getId(), 1);

        // B không mua → submit được (mọi user đăng nhập được review — epic §6.1.6);
        // PENDING của B không hiện public; approve → KHÔNG badge verified
        submitReview(product.getSlugVi(), userB, "Chưa mua vẫn đánh giá được", 3);
        String pending2 = getAdminJson("/api/catalog/admin/reviews?status=PENDING");
        assertThat(om.readTree(pending2).get("total").asInt()).isEqualTo(1);
        String reviewBId = om.readTree(pending2).get("items").get(0).get("id").asText();
        approveReview(reviewBId);

        String body2 = http.getForEntity(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + product.getSlugVi() + "/reviews?page=1&size=20",
            String.class).getBody();
        var list2 = om.readTree(body2);
        assertThat(list2.get("items")).hasSize(2);
        var reviewB = list2.get("items").get(0); // mới nhất trước
        assertThat(reviewB.get("userId").asText()).isEqualTo(userB.toString());
        assertThat(reviewB.get("verifiedPurchase").asBoolean()).isFalse();
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private void startListeners() {
        rabbitListeners.getListenerContainers().forEach(container -> {
            try {
                if (!container.isRunning()) {
                    container.start();
                }
            } catch (Exception e) {
                throw new IllegalStateException("start listener container lỗi", e);
            }
        });
    }

    /** Publish envelope order.confirmed khít schema qua exchange thật (giống ReviewSeedTool). */
    private void publishOrderConfirmed(UUID eventId, UUID orderId, UUID userId, UUID productId) throws Exception {
        Map<String, Object> item = new HashMap<>();
        item.put("productId", productId.toString());
        item.put("variantId", productId.toString());
        item.put("qty", 1);
        item.put("price", 0);
        item.put("name", "IT synthetic item");
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", orderId.toString());
        payload.put("userId", userId.toString());
        payload.put("email", "it@demo.local");
        payload.put("items", java.util.List.of(item));
        payload.put("subtotal", 0);
        payload.put("discount", 0);
        payload.put("shippingFee", 0);
        payload.put("total", 0);
        payload.put("currency", "VND");
        payload.put("confirmedAt", java.time.Instant.now().toString());

        var envelope = new com.ecommerce.common.event.EventEnvelope(
            eventId, "order.confirmed", java.time.Instant.now(), "it-" + eventId,
            "it-synthetic", 1, om.valueToTree(payload));
        rabbit.convertAndSend(RabbitMqConfig.EVENTS_EXCHANGE, RabbitMqConfig.ROUTING_ORDER_CONFIRMED,
            om.writeValueAsString(envelope));
    }

    private void submitReview(String slug, UUID userId, String content, int rating) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintTokenFor(userId.toString(), "CUSTOMER"));
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> body = Map.of("rating", rating, "content", content);
        ResponseEntity<String> res = http.exchange(
            "http://localhost:" + httpPort() + "/api/catalog/products/" + slug + "/reviews",
            HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
        assertThat(res.getStatusCode().value()).isEqualTo(202);
    }

    private String getAdminJson(String path) {
        HttpHeaders admin = new HttpHeaders();
        admin.setBearerAuth(mintTokenFor("it-admin", "ADMIN"));
        return http.exchange("http://localhost:" + httpPort() + path, HttpMethod.GET,
            new HttpEntity<>(admin), String.class).getBody();
    }

    private void approveReview(String reviewId) {
        HttpHeaders admin = new HttpHeaders();
        admin.setBearerAuth(mintTokenFor("it-admin", "ADMIN"));
        ResponseEntity<String> res = http.exchange(
            "http://localhost:" + httpPort() + "/api/catalog/admin/reviews/" + reviewId + "/approve",
            HttpMethod.POST, new HttpEntity<>(admin), String.class);
        assertThat(res.getStatusCode().value()).isEqualTo(200);
    }

    private void awaitEligibility(UUID userId, UUID productId, int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        Integer count = 0;
        while (System.currentTimeMillis() < deadline) {
            count = jdbc.queryForObject("""
                SELECT count(*) FROM review_eligibility WHERE user_id = ? AND product_id = ?
                """, Integer.class, userId, productId);
            if (count != null && count == expected) {
                return;
            }
            Thread.sleep(200);
        }
        org.assertj.core.api.Assertions.fail("eligibility không đạt " + expected + " row: " + count);
    }

    private CategoryEntity category() {
        CategoryEntity c = new CategoryEntity();
        c.setName(new I18nText("Đồ chơi IT", "IT Toys"));
        c.setSlugVi("do-choi-it-" + UUID.randomUUID().toString().substring(0, 8));
        c.setSlugEn("it-toys-" + UUID.randomUUID().toString().substring(0, 8));
        return c;
    }

    private ProductEntity product(CategoryEntity cat) {
        ProductEntity p = new ProductEntity();
        p.setName(new I18nText("Robot lập trình IT-" + UUID.randomUUID().toString().substring(0, 6),
            "IT Robot " + UUID.randomUUID().toString().substring(0, 6)));
        p.setSlugVi("robot-it-" + UUID.randomUUID().toString().substring(0, 8));
        p.setSlugEn("robot-it-en-" + UUID.randomUUID().toString().substring(0, 8));
        p.setDescription(new I18nText("Mô tả robot", "Robot description"));
        p.setCategoryId(cat.getId());
        p.setStatus(ProductStatus.PUBLISHED);
        p.setPrice(499000);
        return p;
    }
}
