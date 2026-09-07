package com.ecommerce.identity.oauth;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.identity.auth.UserSummary;
import com.ecommerce.identity.token.RefreshTokenService;
import com.ecommerce.identity.token.TokenService;
import com.ecommerce.identity.user.Role;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * OAuth Google/Facebook (SF-15, D22): find-or-create + link email.
 *
 * Callback flow: validate state (login-CSRF) → đổi code lấy profile →
 * email bắt buộc + verify (Google email_verified; Facebook presence) →
 * identity có → login; email trùng user → LINK (không duplicate); chưa có →
 * create user (password_hash NULL, role CUSTOMER) + outbox `user.created` →
 * sinh one-time code → FE 302 ?code=. FE POST /oauth/exchange → LoginSuccess.
 */
@Service
public class OAuthService {

    public static final String CALLBACK_PATH = "/login/oauth/callback";
    static final Duration CODE_TTL = Duration.ofSeconds(60);

    private static final Logger log = LoggerFactory.getLogger(OAuthService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OAuthProperties props;
    private final OAuthStateService stateService;
    private final OAuthProviderClient providerClient;
    private final UserIdentityRepository identityRepository;
    private final OneTimeCodeRepository codeRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final RefreshTokenService refreshTokenService;
    private final OutboxWriter outboxWriter;
    private final ObjectMapper objectMapper;

    public OAuthService(OAuthProperties props, OAuthStateService stateService,
                        OAuthProviderClient providerClient, UserIdentityRepository identityRepository,
                        OneTimeCodeRepository codeRepository, UserRepository userRepository,
                        PasswordEncoder passwordEncoder, TokenService tokenService,
                        RefreshTokenService refreshTokenService, OutboxWriter outboxWriter,
                        ObjectMapper objectMapper) {
        this.props = props;
        this.stateService = stateService;
        this.providerClient = providerClient;
        this.identityRepository = identityRepository;
        this.codeRepository = codeRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.refreshTokenService = refreshTokenService;
        this.outboxWriter = outboxWriter;
        this.objectMapper = objectMapper;
    }

    /** URL consent provider — 400 nếu provider lạ/chưa cấu hình (nút ẩn ở FE). */
    public String authorizeUrl(String provider) {
        OAuthProperties.Provider p = requireConfigured(provider);
        String state = stateService.issue(provider);
        return UriComponentsBuilder.fromUriString(p.authorizeUri())
            .queryParam("client_id", p.clientId())
            .queryParam("redirect_uri", props.redirectUri(provider))
            .queryParam("response_type", "code")
            .queryParam("scope", p.scope())
            .queryParam("state", state)
            .build()
            .encode()
            .toUriString();
    }

    /**
     * Callback: trả URL FE để controller 302. Không ném lỗi business — mọi
     * failure chuyển thành ?error=<mã> trên redirect (contract: 302 FE kèm
     * code HOẶC error; chỉ provider lạ là 400 trước redirect).
     */
    @Transactional
    public String callback(String provider, String code, String error, String state) {
        String feBase = props.feRedirectBaseUrl() + CALLBACK_PATH;
        if (error != null && !error.isBlank()) {
            return feRedirect(feBase, "error", sanitizeError(error));
        }
        if (!stateService.valid(state, provider)) {
            // Login-CSRF guard: KHÔNG BAO GIỜ exchange khi state không hợp lệ.
            return feRedirect(feBase, "error", "state_mismatch");
        }
        if (code == null || code.isBlank()) {
            return feRedirect(feBase, "error", "missing_code");
        }
        requireConfigured(provider);
        ProviderProfile profile;
        try {
            profile = providerClient.fetchProfile(provider, code);
        } catch (ResponseStatusException re) {
            log.warn("[oauth] callback provider lỗi ({}): {}", provider, re.getReason());
            return feRedirect(feBase, "error", "provider_error");
        }
        if (profile.email() == null || profile.email().isBlank() || !profile.emailVerified()) {
            return feRedirect(feBase, "error", "no_email");
        }
        String email = profile.email().trim().toLowerCase();
        UserEntity user = findOrCreate(provider, profile, email);
        String raw = issueOneTimeCode(user);
        return feRedirect(feBase, "code", raw);
    }

    /** FE đổi one-time code lấy token — single-use (atomic), hết hạn → 401. */
    @Transactional
    public ExchangeResult exchange(String rawCode) {
        if (rawCode == null || rawCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Code không hợp lệ");
        }
        String hash = sha256Hex(rawCode);
        // Lazy dọn code hết hạn (callback cấp mới cũng gọi — bảng không phình).
        codeRepository.deleteExpired(Instant.now());
        codeRepository.flush();
        if (codeRepository.consumeIfActive(hash, Instant.now()) != 1) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Code hết hạn hoặc đã dùng");
        }
        OneTimeCodeEntity entity = codeRepository.findByCodeHash(hash)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Code không hợp lệ"));
        UserEntity user = userRepository.findById(entity.getUser().getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Code không hợp lệ"));
        String raw = refreshTokenService.issue(user);
        return new ExchangeResult(new com.ecommerce.identity.auth.LoginSuccess(
            tokenService.issue(user), "Bearer", tokenService.accessTtlSeconds(),
            new UserSummary(user.getId(), user.getEmail(), user.getFullName(),
                List.of(user.getRole().name()))), raw);
    }

    public record ExchangeResult(com.ecommerce.identity.auth.LoginSuccess success, String refreshRaw) {}

    private UserEntity findOrCreate(String provider, ProviderProfile profile, String email) {
        // 1) Đã link trước đó → login thẳng.
        UserEntity linked = identityRepository.findByProviderAndProviderId(provider, profile.providerId())
            .map(UserIdentityEntity::getUser)
            .orElse(null);
        if (linked != null) return linked;
        UserEntity user = userRepository.findByEmail(email).orElse(null);
        if (user != null) {
            // 2) Email trùng user có sẵn → LINK (không duplicate — ACCEPTANCE pack).
            UserIdentityEntity identity = new UserIdentityEntity();
            identity.setUser(user);
            identity.setProvider(provider);
            identity.setProviderId(profile.providerId());
            identityRepository.save(identity);
            log.info("[oauth] link {}:{} → user {} ({})", provider, profile.providerId(), user.getId(), email);
            return user;
        }
        // 3) Chưa có → create (OAuth-only: password_hash NULL) + outbox cùng tx.
        UserEntity created = new UserEntity();
        created.setEmail(email);
        created.setPasswordHash(null);
        created.setFullName(profile.name() == null || profile.name().isBlank() ? email : profile.name().trim());
        created.setRole(Role.CUSTOMER);
        created = userRepository.save(created);
        UserIdentityEntity identity = new UserIdentityEntity();
        identity.setUser(created);
        identity.setProvider(provider);
        identity.setProviderId(profile.providerId());
        identityRepository.save(identity);
        JsonNode payload = objectMapper.valueToTree(Map.of(
            "userId", created.getId().toString(),
            "email", created.getEmail(),
            "fullName", created.getFullName(),
            "roles", List.of(created.getRole().name()),
            "createdAt", created.getCreatedAt().toString()));
        outboxWriter.write("user.created", payload, null);
        log.info("[oauth] create user {} từ {}:{} ", created.getId(), provider, profile.providerId());
        return created;
    }

    private String issueOneTimeCode(UserEntity user) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        OneTimeCodeEntity entity = new OneTimeCodeEntity();
        entity.setCodeHash(sha256Hex(raw));
        entity.setUser(user);
        entity.setExpiresAt(Instant.now().plus(CODE_TTL));
        codeRepository.save(entity);
        return raw;
    }

    private String feRedirect(String base, String key, String value) {
        return UriComponentsBuilder.fromUriString(base).queryParam(key, value).build(true).toUriString();
    }

    /** Error param từ provider — chỉ giữ ký tự an toàn, tránh reflect tùy ý. */
    private String sanitizeError(String error) {
        String cleaned = error.replaceAll("[^a-zA-Z0-9_\\-]", "");
        return cleaned.isBlank() ? "provider_error" : cleaned;
    }

    private OAuthProperties.Provider requireConfigured(String provider) {
        OAuthProperties.Provider p = props.provider(provider);
        if (p == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provider không hỗ trợ: " + provider);
        }
        if (!p.configured()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provider chưa cấu hình: " + provider);
        }
        return p;
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
