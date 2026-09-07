package com.ecommerce.identity.twofa;

import com.ecommerce.identity.user.UserEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Trạng thái 2FA của user (SF-15, bảng two_factor — V11).
 * secret_enc/pending_secret_enc mã hóa AES-GCM (SecretCipher); backup_codes
 * lưu BCrypt hash (plaintext chỉ trả 1 lần lúc enable — contract).
 */
@Entity
@Table(name = "two_factor")
public class TwoFactorEntity {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private UserEntity user;

    @Column(name = "secret_enc")
    private byte[] secretEnc;

    @Column(nullable = false)
    private boolean enabled = false;

    @Column(name = "pending_secret_enc")
    private byte[] pendingSecretEnc;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private List<String> backupCodes = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "enabled_at")
    private Instant enabledAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public byte[] getSecretEnc() { return secretEnc; }
    public void setSecretEnc(byte[] secretEnc) { this.secretEnc = secretEnc; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public byte[] getPendingSecretEnc() { return pendingSecretEnc; }
    public void setPendingSecretEnc(byte[] pendingSecretEnc) { this.pendingSecretEnc = pendingSecretEnc; }
    public List<String> getBackupCodes() { return backupCodes; }
    public void setBackupCodes(List<String> backupCodes) { this.backupCodes = backupCodes; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getEnabledAt() { return enabledAt; }
    public void setEnabledAt(Instant enabledAt) { this.enabledAt = enabledAt; }
}
