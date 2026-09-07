package com.ecommerce.log.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.UUID;

/**
 * Document audit trail (D14) — collection {@code event_log}, database
 * {@code db_log}. Shape pin context pack SF-10: {eventId, eventType,
 * routingKey, occurredAt, correlationId, payload, receivedAt}. Unique index
 * eventId = idempotent consume (pack); compound index {eventType, occurredAt}
 * cho query demo (action trên UI → tìm doc theo loại + thời gian).
 */
@Document(collection = "event_log")
@CompoundIndexes({
    @CompoundIndex(name = "idx_type_occurred", def = "{'eventType': 1, 'occurredAt': -1}")
})
public class EventLogDocument {

    @Id
    private String id;

    @Indexed(unique = true)
    private UUID eventId;

    private String eventType;

    /** Routing key AMQP nhận được (= eventType theo convention outbox). */
    private String routingKey;

    private Instant occurredAt;

    private String correlationId;

    private Object payload;

    private Instant receivedAt;

    public static EventLogDocument of(UUID eventId, String eventType, String routingKey,
                                      Instant occurredAt, String correlationId, Object payload) {
        var doc = new EventLogDocument();
        doc.eventId = eventId;
        doc.eventType = eventType;
        doc.routingKey = routingKey;
        doc.occurredAt = occurredAt;
        doc.correlationId = correlationId;
        doc.payload = payload;
        doc.receivedAt = Instant.now();
        return doc;
    }

    public String getId() {
        return id;
    }

    public UUID getEventId() {
        return eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public String getRoutingKey() {
        return routingKey;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public Object getPayload() {
        return payload;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }
}
