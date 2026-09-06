package com.ecommerce.common.outbox;

import com.ecommerce.common.event.EventEnvelope;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ghi event vào bảng {@code outbox} — PHẢI được gọi trong transaction business
 * ({@code MANDATORY}: transactional outbox = row outbox commit cùng business
 * change, không bao giờ publish trực tiếp từ business code).
 *
 * <p><strong>Wire format (một nguồn duy nhất):</strong> {@code payload} trong row
 * outbox = JSON của {@link EventEnvelope} BỌC business payload — consumer đọc
 * {@code eventId} (idempotency key) + {@code eventType} + {@code correlationId}
 * từ envelope body, KHÔNG parse business-payload heuristics.</p>
 *
 * <p>Conventions:</p>
 * <ul>
 *   <li>{@code eventType} = routing key trên exchange topic — dạng
 *       {@code <domain>.<event>} (vd {@code order.confirmed}), additive-only
 *       (xem contracts/README.md).</li>
 *   <li>{@code correlationId} = {@code X-Request-Id} từ gateway (truyền qua
 *       controller/header) — propagate cả envelope lẫn AMQP headers.</li>
 *   <li>Publish là at-least-once — consumer BẮT BUỘC idempotent
 *       (dùng {@link IdempotentConsumer} với {@code envelope.eventId}).</li>
 * </ul>
 */
@Component
public class OutboxWriter {

    private final OutboxMessageRepository repository;
    private final ObjectMapper objectMapper;
    private final Environment environment;

    public OutboxWriter(OutboxMessageRepository repository, ObjectMapper objectMapper, Environment environment) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.environment = environment;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public OutboxMessage write(String eventType, JsonNode payload, String correlationId) {
        try {
            // producer = tên service phát event (envelope.schema.json yêu cầu top-level)
            String producer = environment.getProperty("spring.application.name", "unknown");
            EventEnvelope envelope = EventEnvelope.of(producer, eventType, correlationId, payload);
            OutboxMessage message = OutboxMessage.pending(
                eventType, objectMapper.writeValueAsString(envelope), correlationId);
            return repository.save(message);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không serialize được outbox payload cho " + eventType, e);
        }
    }
}
