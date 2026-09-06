package com.ecommerce.common.event;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

/**
 * Bọc chuẩn cho MỌI event qua RabbitMQ (topic exchange {@code ecommerce.events}).
 *
 * <p>Envelope là hợp đồng cố định (additive-only): consumers đọc
 * {@code eventType} + {@code eventId} (idempotency key) + {@code correlationId}
 * (propagate từ {@code X-Request-Id} của gateway). Payload riêng từng event
 * được freeze tại SF-2 (JSON Schema trong {@code contracts/events/}).</p>
 */
public record EventEnvelope(
    UUID eventId,
    String eventType,
    Instant occurredAt,
    String correlationId,
    JsonNode payload
) {

    public static EventEnvelope of(String eventType, String correlationId, JsonNode payload) {
        return new EventEnvelope(UUID.randomUUID(), eventType, Instant.now(), correlationId, payload);
    }
}
