package com.ecommerce.identity.auth;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.identity.config.RefreshProperties;
import com.ecommerce.identity.token.RefreshTokenService;
import com.ecommerce.identity.token.TokenService;
import com.ecommerce.identity.twofa.TwoFactorDtos.Challenge;
import com.ecommerce.identity.twofa.TwoFactorService;
import com.ecommerce.identity.user.Role;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {

    public static final String REFRESH_COOKIE = "refresh_token";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshProperties refreshProperties;
    private final OutboxWriter outboxWriter;
    private final ObjectMapper objectMapper;
    private final TwoFactorService twoFactorService;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          TokenService tokenService, RefreshTokenService refreshTokenService,
                          RefreshProperties refreshProperties, OutboxWriter outboxWriter,
                          ObjectMapper objectMapper, TwoFactorService twoFactorService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.refreshTokenService = refreshTokenService;
        this.refreshProperties = refreshProperties;
        this.outboxWriter = outboxWriter;
        this.objectMapper = objectMapper;
        this.twoFactorService = twoFactorService;
    }

    /** Đăng ký — 201 UserSummary (auto-login do FE gọi login sau). user.created qua outbox cùng tx. */
    @PostMapping("/register")
    @Transactional
    public ResponseEntity<UserSummary> register(
        @Valid @RequestBody RegisterRequest request,
        @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email đã tồn tại");
        }
        // RACE duplicate: unique constraint nổ → common-lib GlobalExceptionHandler
        // đã map DataIntegrityViolationException → 409 problem+json (không cần catch tại đây).
        UserEntity user = new UserEntity();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFullName(request.fullName().trim());
        user.setRole(Role.CUSTOMER);
        user = userRepository.save(user);

        JsonNode payload = objectMapper.valueToTree(Map.of(
            "userId", user.getId().toString(),
            "email", user.getEmail(),
            "fullName", user.getFullName(),
            "roles", List.of(user.getRole().name()),
            "createdAt", user.getCreatedAt().toString()));
        outboxWriter.write("user.created", payload, requestId);

        return ResponseEntity.status(HttpStatus.CREATED).body(toSummary(user));
    }

    @PostMapping("/login")
    public ResponseEntity<Object> login(@Valid @RequestBody LoginRequest request) {
        UserEntity user = userRepository.findByEmail(request.email().trim().toLowerCase())
            // SF-15: hash NULL = OAuth-only user — không bao giờ khớp password
            // (matches(raw, null) sẽ NPE — guard tường minh, 401 thống nhất).
            .filter(u -> u.getPasswordHash() != null
                && passwordEncoder.matches(request.password(), u.getPasswordHash()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không đúng"));
        // SF-15: 2FA bật → challenge thay vì token (contract oneOf LoginResponse).
        if (twoFactorService.isEnabled(user.getId())) {
            return ResponseEntity.ok(new Challenge(true, twoFactorService.issueChallenge(user)));
        }
        String accessToken = tokenService.issue(user);
        String raw = refreshTokenService.issue(user);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(raw, refreshTokenService.ttl()).toString())
            .body(new LoginSuccess(accessToken, "Bearer", tokenService.accessTtlSeconds(), toSummary(user)));
    }

    /** KHÔNG body — đọc cookie. Rotate: revoke cũ + cấp mới (Set-Cookie mới). */
    @PostMapping("/refresh")
    public ResponseEntity<RefreshResponse> refresh(
        @CookieValue(value = REFRESH_COOKIE, required = false) String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thiếu refresh token");
        }
        RefreshTokenService.Rotated rotated = refreshTokenService.rotate(rawToken);
        UserEntity user = rotated.user();
        String accessToken = tokenService.issue(user);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(rotated.newRawToken(), refreshTokenService.ttl()).toString())
            .body(new RefreshResponse(accessToken, tokenService.accessTtlSeconds()));
    }

    /** 204 + revoke + xóa cookie. Cookie thiếu/không hợp lệ → 401 (không revoked bậy). */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
        @CookieValue(value = REFRESH_COOKIE, required = false) String rawToken) {
        if (rawToken == null || rawToken.isBlank() || !refreshTokenService.revoke(rawToken)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token không hợp lệ");
        }
        ResponseCookie cleared = ResponseCookie.from(REFRESH_COOKIE, "")
            .httpOnly(true).sameSite("Lax").path(refreshProperties.cookiePath()).maxAge(0).build();
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, cleared.toString())
            .build();
    }

    private ResponseCookie refreshCookie(String raw, Duration ttl) {
        return ResponseCookie.from(REFRESH_COOKIE, raw)
            .httpOnly(true)
            .sameSite("Lax")
            .path(refreshProperties.cookiePath())
            .maxAge(ttl)
            .build();
    }

    static UserSummary toSummary(UserEntity user) {
        return new UserSummary(user.getId(), user.getEmail(), user.getFullName(), List.of(user.getRole().name()));
    }
}
