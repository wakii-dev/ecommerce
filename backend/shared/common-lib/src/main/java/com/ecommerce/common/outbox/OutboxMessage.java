package com.ecommerce.common.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Row outbox — ghi CÙNG transaction với business change
 * (qua {@link OutboxWriter#write}), relay publish sau.
 */
@Entity
@Table(name = "outbox")
public class OutboxMessage {

    @Id
    private UUID id;

    /** Routing key trên topic exchange (vd {@code order.confirmed}). */
    @Column(nullable = false, length = 128)
    private String eventType;

    /** JSON payload (schema freeze tại SF-2 trong contracts/events/). */
    @Column(nullable = false, columnDefinition = "jsonb")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private String payload;

    /** Từ {@code X-Request-Id} của gateway — propagate end-to-end. */
    @Column(length = 64)
    private String correlationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private OutboxStatus status;

    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    private Instant sentAt;

    @Column(length = 1024)
    private String lastError;

    protected OutboxMessage() {
        // JPA
    }

    private OutboxMessage(UUID id, String eventType, String payload, String correlationId) {
        this.id = id;
        this.eventType = eventType;
        this.payload = payload;
        this.correlationId = correlationId;
        this.status = OutboxStatus.PENDING;
        this.attempts = 0;
    }

    public static OutboxMessage pending(String eventType, String payload, String correlationId) {
        return new OutboxMessage(UUID.randomUUID(), eventType, payload, correlationId);
    }

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getEventType() {
        return eventType;
    }

    public String getPayload() {
        return payload;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public OutboxStatus getStatus() {
        return status;
    }

    public void setStatus(OutboxStatus status) {
        this.status = status;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public void setSentAt(Instant sentAt) {
        this.sentAt = sentAt;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError;
    }
}
