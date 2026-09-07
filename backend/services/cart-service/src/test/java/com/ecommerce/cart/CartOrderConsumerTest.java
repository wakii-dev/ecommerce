package com.ecommerce.cart;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ecommerce.cart.domain.CartModels.CartDocument;
import com.ecommerce.cart.domain.CartModels.LineItem;
import com.ecommerce.cart.store.CartStore;
import com.ecommerce.common.event.EventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT consumer order.confirmed (SF-10, §3.2): publish envelope khít schema
 * frozen QUA exchange thật {@code ecommerce.events} (pattern
 * AffiliateLedgerConsumerTest SF-12 — raw Message như OutboxRelay) →
 * {@code cart:user:{userId}} bị xóa; re-delivery CÙNG eventId → no-op (DEL
 * tự idempotent); event lạ trong payload → bỏ qua không crash.
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
class CartOrderConsumerTest extends AbstractCartIntegrationTest {

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3-management")
        .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1));

    @DynamicPropertySource
    static void rabbit(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
        // Consumer thật chạy — override base tắt listener (dynamic THẮNG base)
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "true");
    }

    @Autowired
    RabbitTemplate rabbit;
    @Autowired
    ObjectMapper om;
    @Autowired
    CartStore cartStore;

    @Test
    void confirmedXoaCartUserVaIdempotent() throws Exception {
        String userId = UUID.randomUUID().toString();
        String key = CartStore.userKey(userId);
        cartStore.save(key, new CartDocument(List.of(
            new LineItem(UUID.randomUUID(), UUID.randomUUID(), null, 2,
                "demo-product", "Sản phẩm demo", null, 100_000, false)),
            Instant.now()));

        // listener auto-startup=true từ context boot — connection + queue/binding
        // declaration đã hoàn tất trước khi test chạy (pattern affiliate)
        UUID eventId = UUID.randomUUID();
        publishConfirmed(eventId, userId);
        awaitCartKeyExists(key, false);

        // re-delivery CÙNG eventId — DEL lại, không lỗi (tự idempotent)
        publishConfirmed(eventId, userId);
        Thread.sleep(Duration.ofSeconds(1).toMillis());
        assertThat(cartStore.load(key)).isEmpty();
    }

    @Test
    void payloadThieuUserIdKhongCrash() throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", UUID.randomUUID().toString());
        // thiếu userId
        var envelope = new EventEnvelope(UUID.randomUUID(), "order.confirmed", Instant.now(),
            "it-no-user", "it-synthetic", 1, om.valueToTree(payload));
        sendRawMessage("order.confirmed", om.writeValueAsString(envelope), UUID.randomUUID());
        Thread.sleep(Duration.ofSeconds(1).toMillis()); // consumer xử lý xong, không chết
        // listener vẫn sống — publish tiếp vẫn xử lý
        String userId = UUID.randomUUID().toString();
        String key = CartStore.userKey(userId);
        cartStore.save(key, CartDocument.empty());
        publishConfirmed(UUID.randomUUID(), userId);
        awaitCartKeyExists(key, false);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private void publishConfirmed(UUID eventId, String userId) throws Exception {
        Map<String, Object> item = new HashMap<>();
        item.put("productId", UUID.randomUUID().toString());
        item.put("variantId", UUID.randomUUID().toString());
        item.put("qty", 2);
        item.put("price", 100_000);
        item.put("name", "IT synthetic item");
        Map<String, Object> payload = new HashMap<>();
        payload.put("orderId", UUID.randomUUID().toString());
        payload.put("userId", userId);
        payload.put("email", "it-cart@demo.local");
        payload.put("items", List.of(item));
        payload.put("subtotal", 200_000);
        payload.put("discount", 0);
        payload.put("shippingFee", 25_000);
        payload.put("total", 225_000);
        payload.put("currency", "VND");
        payload.put("confirmedAt", Instant.now().toString());

        var envelope = new EventEnvelope(eventId, "order.confirmed", Instant.now(),
            "it-" + eventId, "it-synthetic", 1, om.valueToTree(payload));
        sendRawMessage("order.confirmed", om.writeValueAsString(envelope), eventId);
    }

    /** Raw Message như OutboxRelay — KHÔNG __TypeId__ header (xem affiliate). */
    private void sendRawMessage(String routingKey, String envelopeJson, UUID messageId) {
        MessageProperties properties = new MessageProperties();
        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        properties.setMessageId(String.valueOf(messageId));
        properties.setHeader("eventType", routingKey);
        rabbit.send("ecommerce.events", routingKey,
            new Message(envelopeJson.getBytes(StandardCharsets.UTF_8), properties));
    }

    private void awaitCartKeyExists(String key, boolean expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            boolean exists = cartStore.load(key).isPresent();
            if (exists == expected) {
                return;
            }
            Thread.sleep(200);
        }
        assertThat(cartStore.load(key).isPresent())
            .as("cart key %s tồn tại=%s sau 10s", key, expected)
            .isTrue();
    }
}
