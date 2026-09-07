package com.ecommerce.identity.auth;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.identity.token.RefreshTokenService;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

/**
 * Password forgot/reset (SF-13 A1 — contract identity.yaml D21).
 *
 * <ul>
 *   <li><strong>forgot</strong> — email có tồn tại hay không cũng trả 202
 *       (anti-enumeration); có tồn tại: tạo token (raw base64url 32B chỉ nằm
 *       trong email link, DB giữ SHA-256 hex — convention refresh_tokens) TTL
 *       30' + outbox event {@code user.password_reset_requested} (email + raw
 *       token — notification dựng link; ADR 0005: event ngoài freeze 13,
 *       raw-token trên bus chấp nhận demo — single-use 30').</li>
 *   <li><strong>reset</strong> — token sai/hết hạn/đã dùng → 401 (contract);
 *       OK → BCrypt mật khẩu mới + mark used + revoke MỌI refresh token —
 *       MỘT tx.</li>
 * </ul>
 */
@Service
public class PasswordResetService {

    static final long TTL_SECONDS = 30 * 60;

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokens;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final OutboxWriter outboxWriter;
    private final ObjectMapper objectMapper;

    public PasswordResetService(UserRepository userRepository, PasswordResetTokenRepository tokens,
                                PasswordEncoder passwordEncoder, RefreshTokenService refreshTokenService,
                                OutboxWriter outboxWriter, ObjectMapper objectMapper) {
        this.userRepository = userRepository;
        this.tokens = tokens;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenService = refreshTokenService;
        this.outboxWriter = outboxWriter;
        this.objectMapper = objectMapper;
    }

    /** Forgot — luôn 202; token + event chỉ khi email tồn tại. */
    @Transactional
    public void forgot(String email, String requestId) {
        userRepository.findByEmail(email.trim().toLowerCase()).ifPresent(user -> {
            byte[] rawBytes = new byte[32];
            RANDOM.nextBytes(rawBytes);
            String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(rawBytes);
            Instant expiresAt = Instant.now().plusSeconds(TTL_SECONDS);

            PasswordResetTokenEntity token = new PasswordResetTokenEntity();
            token.setUser(user);
            token.setTokenHash(sha256Hex(raw));
            token.setExpiresAt(expiresAt);
            tokens.save(token);

            var payload = objectMapper.valueToTree(Map.of(
                "email", user.getEmail(),
                "token", raw,
                "expiresAt", expiresAt.toString()));
            outboxWriter.write("user.password_reset_requested", payload, requestId);
            log.info("password reset requested — token cấp cho user {}", user.getId());
        });
    }

    /** Reset — 401 token sai/hết hạn/đã dùng; OK đổi mật khẩu + revoke mọi refresh. */
    @Transactional
    public void reset(String rawToken, String newPassword) {
        PasswordResetTokenEntity token = tokens.findByTokenHash(sha256Hex(rawToken))
            .filter(t -> t.getUsedAt() == null && t.getExpiresAt().isAfter(Instant.now()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token không hợp lệ hoặc đã hết hạn"));

        UserEntity user = token.getUser();
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        token.setUsedAt(Instant.now());
        refreshTokenService.revokeAllForUser(user.getId());
    }

    static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 không khả dụng", e);
        }
    }
}
