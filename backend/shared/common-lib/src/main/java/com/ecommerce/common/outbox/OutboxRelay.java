package com.ecommerce.common.outbox;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

/**
 * Poll bảng {@code outbox} → publish RabbitMQ topic exchange → mark SENT.
 *
 * <p>Semantics: <strong>at-least-once</strong> (publish thành công nhưng crash
 * trước khi mark SENT → publish lại lần poll sau — consumer idempotent qua
 * {@link IdempotentConsumer}). Retry: mỗi lần poll thử lại PENDING; quá
 * {@code outbox.relay.max-attempts} → FAILED (giữ row + lastError để ops
 * debug/requeue — relay không tự xóa, không tự dead-letter queue).</p>
 *
 * <p>Service dùng phải: {@code @EnableScheduling} + bảng outbox (copy
 * {@code sql/outbox-schema.sql} vào migration V1) + đặt
 * {@code outbox.relay.enabled=false} nếu service không publish event.</p>
 */
@Component
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxMessageRepository repository;
    private final RabbitTemplate rabbitTemplate;
    private final String exchange;
    private final int maxAttempts;
    private final int batchSize;
    private final boolean enabled;

    public OutboxRelay(
        OutboxMessageRepository repository,
        RabbitTemplate rabbitTemplate,
        @Value("${outbox.relay.exchange:ecommerce.events}") String exchange,
        @Value("${outbox.relay.max-attempts:5}") int maxAttempts,
        @Value("${outbox.relay.batch-size:100}") int batchSize,
        @Value("${outbox.relay.enabled:true}") boolean enabled
    ) {
        this.repository = repository;
        this.rabbitTemplate = rabbitTemplate;
        this.exchange = exchange;
        this.maxAttempts = maxAttempts;
        this.batchSize = batchSize;
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${outbox.relay.poll-interval-ms:2000}")
    public void poll() {
        if (!enabled) {
            return;
        }
        List<OutboxMessage> batch =
            repository.findByStatusOrderByIdAsc(OutboxStatus.PENDING, Limit.of(batchSize));
        batch.forEach(this::relayOne);
    }

    /**
     * Không bọc transaction quanh publish: mỗi {@code repository.save} tự atomic
     * (Spring Data), publish không transactional — crash giữa publish + save
     * chỉ tạo duplicate publish (at-least-once, consumer idempotent).
     */
    protected void relayOne(OutboxMessage message) {
        try {
            rabbitTemplate.send(exchange, message.getEventType(), toAmqpMessage(message));
            message.setStatus(OutboxStatus.SENT);
            message.setSentAt(Instant.now());
            repository.save(message);
        } catch (Exception e) {
            int attempts = message.getAttempts() + 1;
            message.setAttempts(attempts);
            message.setLastError(truncate(e.getMessage()));
            if (attempts >= maxAttempts) {
                message.setStatus(OutboxStatus.FAILED);
                log.error("Outbox {} FAILED sau {} lần thử — cần ops requeue", message.getId(), attempts, e);
            } else {
                log.warn("Outbox {} publish lỗi (lần {}/{}) — sẽ retry",
                    message.getId(), attempts, maxAttempts, e);
            }
            repository.save(message);
        }
    }

    private Message toAmqpMessage(OutboxMessage message) {
        // Body = EventEnvelope JSON (wrap tại OutboxWriter — consumer đọc
        // eventId/eventType/correlationId từ envelope). Headers chỉ là bản sao
        // tiện cho middleware (router/debug), KHÔNG phải nguồn dữ liệu.
        MessageProperties properties = new MessageProperties();
        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        properties.setMessageId(String.valueOf(message.getId()));
        properties.setHeader("eventType", message.getEventType());
        properties.setHeader("correlationId", message.getCorrelationId());
        return new Message(message.getPayload().getBytes(StandardCharsets.UTF_8), properties);
    }

    private String truncate(String text) {
        if (text == null) {
            return null;
        }
        return text.length() <= 1024 ? text : text.substring(0, 1024);
    }
}
