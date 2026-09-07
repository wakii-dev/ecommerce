package com.ecommerce.identity.twofa;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cấu hình 2FA TOTP (SF-15). encryptionKey = AES-256-GCM key Base64 32 byte
 * (openssl rand -base64 32). KHÔNG có key: profile dev dùng dev-key mặc định
 * + WARN; profile khác FAIL-FAST lúc boot (SecretCipher) — 2FA không bao giờ
 * chạy với key "im lặng".
 */
@ConfigurationProperties(prefix = "identity.twofa")
public record TwoFactorProperties(String encryptionKey, int challengeTtlSeconds, int backupCodeCount) {

    /** Khớp default dev trong .env.example — CHỈ dành dev, không dùng prod. */
    static final String DEV_FALLBACK_KEY = "lhQg8gQZ7D5xAkXAEu56dOfwyfVUnZ3Doviwl8MBb+Q=";

    public TwoFactorProperties {
        if (challengeTtlSeconds <= 0) challengeTtlSeconds = 300;
        if (backupCodeCount <= 0) backupCodeCount = 10;
    }
}
