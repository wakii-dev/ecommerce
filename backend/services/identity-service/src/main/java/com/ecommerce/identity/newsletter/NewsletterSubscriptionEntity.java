package com.ecommerce.identity.newsletter;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Đăng ký nhận tin (SF-13 A8) — email UNIQUE, không double subscribe. */
@Entity
@Table(name = "newsletter_subscriptions")
public class NewsletterSubscriptionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public Instant getCreatedAt() { return createdAt; }
}
