package com.ecommerce.partner.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "partners")
public class PartnerEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PartnerStatus status = PartnerStatus.ACTIVE;

    /** Nullable — partner không đăng ký webhook thì delivery bỏ qua. */
    @Column(name = "webhook_url", length = 512)
    private String webhookUrl;

    /** Secret dùng HMAC-SHA256 ký body webhook (hex lowercase — X-Signature). */
    @Column(name = "webhook_secret", nullable = false, length = 128)
    private String webhookSecret;

    @Column(name = "rate_limit_per_min", nullable = false)
    private int rateLimitPerMin = 60;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public PartnerStatus getStatus() { return status; }
    public void setStatus(PartnerStatus status) { this.status = status; }
    public String getWebhookUrl() { return webhookUrl; }
    public void setWebhookUrl(String webhookUrl) { this.webhookUrl = webhookUrl; }
    public String getWebhookSecret() { return webhookSecret; }
    public void setWebhookSecret(String webhookSecret) { this.webhookSecret = webhookSecret; }
    public int getRateLimitPerMin() { return rateLimitPerMin; }
    public void setRateLimitPerMin(int rateLimitPerMin) { this.rateLimitPerMin = rateLimitPerMin; }
    public Instant getCreatedAt() { return createdAt; }
}
