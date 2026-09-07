package com.ecommerce.identity.oauth;

import com.ecommerce.identity.user.UserEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * One-time code (SF-15): callback 302 về FE kèm raw code trên query; FE đổi
 * lấy token qua POST /oauth/exchange. DB chỉ giữ SHA-256 hash — raw 32B
 * Base64url, TTL 60s, single-use (consumed_at), dọn row hết hạn khi cấp mới.
 */
@Entity
@Table(name = "oauth_one_time_codes")
public class OneTimeCodeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "code_hash", nullable = false, unique = true)
    private String codeHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public String getCodeHash() { return codeHash; }
    public void setCodeHash(String codeHash) { this.codeHash = codeHash; }
    public UserEntity getUser() { return user; }
    public void setUser(UserEntity user) { this.user = user; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getConsumedAt() { return consumedAt; }
    public void setConsumedAt(Instant consumedAt) { this.consumedAt = consumedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
