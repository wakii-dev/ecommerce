package com.ecommerce.identity.token;

import com.ecommerce.identity.config.RefreshProperties;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Refresh token: raw 32 byte random (cookie) — DB chỉ giữ SHA-256 hex.
 * Rotation: refresh hợp lệ → revoke row cũ + cấp row mới (reuse row revoked → 401).
 */
@Service
public class RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository repository;
    private final UserRepository userRepository;
    private final RefreshProperties props;

    public RefreshTokenService(RefreshTokenRepository repository, UserRepository userRepository,
                               RefreshProperties props) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.props = props;
    }

    public record Rotated(UserEntity user, String newRawToken) {}

    @Transactional
    public String issue(UserEntity user) {
        String raw = newRawToken();
        RefreshTokenEntity entity = new RefreshTokenEntity();
        entity.setUser(user);
        entity.setTokenHash(sha256Hex(raw));
        entity.setExpiresAt(Instant.now().plus(Duration.ofDays(props.ttlDays())));
        repository.save(entity);
        return raw;
    }

    /** Verify + ROTATE: revoke row cũ (ATOMIC), cấp token mới. Sai/đã revoke/hết hạn/thua race → 401. */
    @Transactional
    public Rotated rotate(String rawToken) {
        RefreshTokenEntity entity = repository.findByTokenHash(sha256Hex(rawToken))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token không hợp lệ"));
        Instant now = Instant.now();
        // UPDATE ... WHERE revoked_at IS NULL — atomic, không read-check-write:
        // 2 request cùng token → DB row lock, đúng 1 thấy 1 row; thua race = 0 → 401.
        if (repository.revokeIfActive(entity.getTokenHash(), now) != 1) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token đã bị thu hồi");
        }
        if (entity.getExpiresAt().isBefore(now)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token đã hết hạn");
        }
        // entity.getUser() là proxy LAZY — load entity THẬT trong tx để caller
        // đọc claims (role/email/...) SAU khi tx đóng không vấp LazyInitialization.
        UserEntity user = userRepository.findById(entity.getUser().getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token không hợp lệ"));
        String newRaw = issue(user);
        return new Rotated(user, newRaw);
    }

    /** Logout — idempotent. Trả false nếu token không tồn tại/hết hạn. */
    @Transactional
    public boolean revoke(String rawToken) {
        return repository.findByTokenHash(sha256Hex(rawToken))
            .map(entity -> {
                boolean wasActive = entity.getRevokedAt() == null
                    && entity.getExpiresAt().isAfter(Instant.now());
                if (entity.getRevokedAt() == null) entity.setRevokedAt(Instant.now());
                return wasActive;
            })
            .orElse(false);
    }

    /** Revoke MỌI refresh token của user (SF-13 A1 — password reset xong đăng xuất mọi phiên). */
    @Transactional
    public int revokeAllForUser(java.util.UUID userId) {
        return repository.revokeAllForUser(userId, Instant.now());
    }

    public Duration ttl() {
        return Duration.ofDays(props.ttlDays());
    }

    public String cookiePath() {
        return props.cookiePath();
    }

    private String newRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
