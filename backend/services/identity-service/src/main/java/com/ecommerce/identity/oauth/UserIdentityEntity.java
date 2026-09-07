package com.ecommerce.identity.oauth;

import com.ecommerce.identity.user.UserEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Liên kết user ↔ provider (SF-15). UNIQUE(provider, provider_id) ở DDL V11. */
@Entity
@Table(name = "user_identities")
public class UserIdentityEntity {

    public static final String GOOGLE = "google";
    public static final String FACEBOOK = "facebook";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(nullable = false)
    private String provider;

    @Column(name = "provider_id", nullable = false)
    private String providerId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UserEntity getUser() { return user; }
    public void setUser(UserEntity user) { this.user = user; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getProviderId() { return providerId; }
    public void setProviderId(String providerId) { this.providerId = providerId; }
    public Instant getCreatedAt() { return createdAt; }
}
