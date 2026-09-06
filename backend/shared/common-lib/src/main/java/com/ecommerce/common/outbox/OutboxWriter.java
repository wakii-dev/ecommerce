package com.ecommerce.common.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ghi event vào bảng {@code outbox} — PHẢI được gọi trong transaction business
 * ({@code MANDATORY}: transactional outbox = row outbox commit cùng business
 * change, không bao giờ publish trực tiếp từ business code).
 *
 * <p>Conventions:</p>
 * <ul>
 *   <li>{@code eventType} = routing key trên exchange topic — dạng
 *       {@code <domain>.<event>} (vd {@code order.confirmed}), additive-only
 *       (xem contracts/README.md).</li>
 *   <li>{@code correlationId} = {@code X-Request-Id} từ gateway (truyền qua
 *       controller/header) — propagate sang RabbitMQ headers.</li>
 *   <li>Publish là at-least-once — consumer BẮT BUỘC idempotent
 *       (dùng {@link IdempotentConsumer} với {@code eventId}).</li>
 * </ul>
 */
@Component
public class OutboxWriter {

    private final OutboxMessageRepository repository;
    private final ObjectMapper objectMapper;

    public OutboxWriter(OutboxMessageRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public OutboxMessage write(String eventType, JsonNode payload, String correlationId) {
        try {
            OutboxMessage message = OutboxMessage.pending(
                eventType, objectMapper.writeValueAsString(payload), correlationId);
            return repository.save(message);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không serialize được outbox payload cho " + eventType, e);
        }
    }
}
