package com.ecommerce.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Nhật ký email (SF-10 V10__send_log) — 1 row mỗi attempt: SENT (đã qua
 * SMTP), SKIPPED_NO_EMAIL (payload không có email — fat-payload rule), FAILED
 * (SMTP lỗi — không rethrow để không requeue vô hạn).
 */
@Entity
@Table(name = "send_log")
public class SendLog {

    public static final String STATUS_SENT = "SENT";
    public static final String STATUS_SKIPPED_NO_EMAIL = "SKIPPED_NO_EMAIL";
    public static final String STATUS_FAILED = "FAILED";

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "recipient")
    private String recipient;

    @Column(name = "subject", length = 500)
    private String subject;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "attachment", nullable = false)
    private boolean attachment;

    @Column(name = "error")
    private String error;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected SendLog() {
    }

    public SendLog(UUID eventId, String eventType, String recipient, String subject,
                   String status, boolean attachment, String error) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.recipient = recipient;
        this.subject = subject;
        this.status = status;
        this.attachment = attachment;
        this.error = error;
    }

    public UUID getId() {
        return id;
    }

    public UUID getEventId() {
        return eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public String getRecipient() {
        return recipient;
    }

    public String getSubject() {
        return subject;
    }

    public String getStatus() {
        return status;
    }

    public boolean isAttachment() {
        return attachment;
    }

    public String getError() {
        return error;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
