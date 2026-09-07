package com.ecommerce.cart.abandoned;

import com.ecommerce.cart.domain.CartModels.CartDocument;
import com.ecommerce.cart.store.CartStore;
import com.ecommerce.common.event.EventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Abandoned cart sweeper (SF-13 A4): giỏ USER có items + email, không cập nhật
 * ≥ {@code cart.abandoned.idle-minutes} (mặc định 120) → publish event
 * {@code cart.abandoned} (fat payload: email nằm trong payload — precedent
 * SKIPPED_NO_EMAIL §6.1.5) → notification gửi mail nhắc. Flag Redis
 * {@code cart:abandoned_notified:<sub>} TTL 24h = tối đa 1 mail/cart/ngày.
 *
 * <p><strong>DEVIATION (ADR 0005):</strong> cart KHÔNG outbox (không DB — D8),
 * publish TRỰC TIẾP RabbitTemplate raw Message (mimic
 * {@code OutboxRelay.toAmqpMessage}). Flag set TRƯỚC publish = at-most-once
 * (mất 1 mail khi crash giữa chừng — chấp nhận, email không critical).
 * Chạy 1 instance (convention không ShedLock như inventory/ordering sweepers).</p>
 */
@Component
@ConditionalOnProperty(name = "cart.abandoned.enabled", havingValue = "true", matchIfMissing = true)
public class AbandonedCartSweeper {

    private static final Logger log = LoggerFactory.getLogger(AbandonedCartSweeper.class);

    private final CartStore store;
    private final RabbitTemplate rabbit;
    private final org.springframework.data.redis.core.StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final String exchange;
    private final Duration idle;
    private final Duration flagTtl;

    public AbandonedCartSweeper(CartStore store, RabbitTemplate rabbit,
                                org.springframework.data.redis.core.StringRedisTemplate redis,
                                ObjectMapper objectMapper,
                                @Value("${outbox.relay.exchange:ecommerce.events}") String exchange,
                                @Value("${cart.abandoned.idle-minutes:120}") long idleMinutes,
                                @Value("${cart.abandoned.flag-ttl-hours:24}") long flagTtlHours) {
        this.store = store;
        this.rabbit = rabbit;
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.exchange = exchange;
        this.idle = Duration.ofMinutes(idleMinutes);
        this.flagTtl = Duration.ofHours(flagTtlHours);
    }

    /** Sweep định kỳ — batch qua SCAN (không KEYS), mỗi user key xử lý độc lập. */
    @Scheduled(fixedDelayString = "${cart.abandoned.sweep-interval-ms:60000}")
    public void sweep() {
        Instant threshold = Instant.now().minus(idle);
        List<String> userKeys = new ArrayList<>();
        try (Cursor<String> cursor = redis.scan(
                ScanOptions.scanOptions().match(CartStore.userKey("*")).count(200).build())) {
            cursor.forEachRemaining(userKeys::add);
        }
        int notified = 0;
        for (String key : userKeys) {
            try {
                if (sweepOne(key, threshold)) {
                    notified++;
                }
            } catch (Exception e) {
                log.warn("abandoned sweep lỗi ở {} — bỏ qua, lần sau quét lại: {}", key, e.toString());
            }
        }
        if (notified > 0) {
            log.info("abandoned cart sweep — {} giỏ nhận mail nhắc", notified);
        }
    }

    /** @return true nếu đã publish (mail nhắc) cho giỏ này. */
    boolean sweepOne(String key, Instant threshold) throws Exception {
        CartDocument doc = store.load(key).orElse(null);
        if (doc == null || doc.items().isEmpty() || doc.email() == null || doc.email().isBlank()) {
            return false;
        }
        if (doc.updatedAt() == null || doc.updatedAt().isAfter(threshold)) {
            return false; // còn "nóng" — chưa bỏ quên
        }
        String sub = key.substring(CartStore.userKey("").length());
        Boolean first = redis.opsForValue().setIfAbsent(
            "cart:abandoned_notified:" + sub, "1", flagTtl);
        if (!Boolean.TRUE.equals(first)) {
            return false; // đã nhắc trong 24h qua
        }
        publishAbandoned(sub, doc);
        return true;
    }

    private void publishAbandoned(String sub, CartDocument doc) throws Exception {
        String userId = sub;
        ObjectNode payload = objectMapper.createObjectNode()
            .put("userId", userId)
            .put("email", doc.email())
            .put("itemCount", doc.items().size())
            .put("updatedAt", doc.updatedAt().toString());
        EventEnvelope envelope = EventEnvelope.of(
            "cart-service", "cart.abandoned", "system:abandoned-cart", payload);

        MessageProperties props = new MessageProperties();
        props.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        props.setDeliveryMode(org.springframework.amqp.core.MessageDeliveryMode.PERSISTENT);
        props.setMessageId(envelope.eventId().toString());
        props.setHeader("eventType", "cart.abandoned");
        rabbit.send(exchange, "cart.abandoned",
            new Message(objectMapper.writeValueAsBytes(envelope), props));
    }
}
