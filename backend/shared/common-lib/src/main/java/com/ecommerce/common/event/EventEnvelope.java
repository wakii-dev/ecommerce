package com.ecommerce.common.event;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

/**
 * Bọc chuẩn cho MỌI event qua RabbitMQ (topic exchange {@code ecommerce.events}).
 *
 * <p>Envelope là hợp đồng cố định (additive-only): consumers đọc
 * {@code eventType} + {@code eventId} (idempotency key) + {@code correlationId}
 * (propagate từ {@code X-Request-Id} của gateway) + {@code producer} +
 * {@code schemaVersion} — khớp freeze {@code contracts/events/envelope.schema.json}.
 * Payload riêng từng event được freeze tại SF-2 (JSON Schema trong
 * {@code contracts/events/}).</p>
 */
public record EventEnvelope(
    UUID eventId,
    String eventType,
    Instant occurredAt,
    String correlationId,
    String producer,
    int schemaVersion,
    JsonNode payload
) {

    /** Tăng CHỈ khi payload schema đổi (additive-only — xem contracts/README.md). */
    public static final int CURRENT_SCHEMA_VERSION = 1;

    /** Factory chuẩn — producer là {@code spring.application.name} (OutboxWriter truyền vào). */
    public static EventEnvelope of(String producer, String eventType, String correlationId, JsonNode payload) {
        return new EventEnvelope(UUID.randomUUID(), eventType, Instant.now(), correlationId,
            producer, CURRENT_SCHEMA_VERSION, payload);
    }

    /** Fallback producer="unknown" — giữ tương thích caller cũ chưa biết producer. */
    public static EventEnvelope of(String eventType, String correlationId, JsonNode payload) {
        return of("unknown", eventType, correlationId, payload);
    }
}
