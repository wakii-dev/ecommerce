package com.ecommerce.common.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

/** Consumer bookkeeping — 1 row cho mỗi eventId đã xử lý (idempotency). */
@Entity
@Table(name = "processed_messages")
public class ProcessedMessage {

    @Id
    @Column(length = 64)
    private String messageId;

    @Column(nullable = false, updatable = false)
    private Instant processedAt;

    protected ProcessedMessage() {
        // JPA
    }

    public ProcessedMessage(String messageId) {
        this.messageId = messageId;
    }

    @PrePersist
    void onCreate() {
        this.processedAt = Instant.now();
    }

    public String getMessageId() {
        return messageId;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }
}
