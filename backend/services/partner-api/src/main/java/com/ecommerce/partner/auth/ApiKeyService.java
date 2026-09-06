package com.ecommerce.partner.auth;

import com.ecommerce.partner.domain.ApiKeyEntity;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.domain.PartnerStatus;
import com.ecommerce.partner.repo.ApiKeyRepository;
import com.ecommerce.partner.repo.PartnerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Xác thực API key: raw → sha256 → lookup theo prefix (8 ký tự đầu) → so hash
 * bằng {@link MessageDigest#isEqual} (constant-time — không leak timing).
 * Key đúng nhưng partner SUSPENDED / key revoked / hết hạn → không chấp nhận
 * (401 ở filter — contract: "sai/hết hạn → 401").
 */
@Service
public class ApiKeyService {

    private static final Logger log = LoggerFactory.getLogger(ApiKeyService.class);

    public static final int PREFIX_LENGTH = 8;

    private final ApiKeyRepository apiKeys;
    private final PartnerRepository partners;

    public ApiKeyService(ApiKeyRepository apiKeys, PartnerRepository partners) {
        this.apiKeys = apiKeys;
        this.partners = partners;
    }

    public Optional<ApiKeyPrincipal> authenticate(String rawKey) {
        if (rawKey == null || rawKey.isBlank() || rawKey.length() <= PREFIX_LENGTH) {
            return Optional.empty();
        }
        String prefix = rawKey.substring(0, PREFIX_LENGTH);
        byte[] candidateHash = sha256(rawKey);
        String candidateHex = HexFormat.of().formatHex(candidateHash);

        for (ApiKeyEntity key : apiKeys.findByPrefix(prefix)) {
            // Constant-time compare trên HASH BYTES (không short-circuit theo ký tự)
            if (!MessageDigest.isEqual(candidateHash, sha256HexToBytes(key.getKeyHash()))) {
                continue;
            }
            if (key.getRevokedAt() != null || (key.getExpiresAt() != null && !key.getExpiresAt().isAfter(Instant.now()))) {
                log.info("API key {} từ chối (revoked/hết hạn)", key.getPrefix());
                return Optional.empty();
            }
            PartnerEntity partner = partners.findById(key.getPartnerId()).orElse(null);
            if (partner == null || partner.getStatus() != PartnerStatus.ACTIVE) {
                log.info("API key {} từ chối (partner không ACTIVE)", key.getPrefix());
                return Optional.empty();
            }
            Set<String> scopes = key.getScopes() == null ? Set.of()
                : key.getScopes().stream().map(String::trim).collect(Collectors.toSet());
            return Optional.of(new ApiKeyPrincipal(key.getId(), partner.getId(), partner.getName(),
                scopes, partner.getRateLimitPerMin()));
        }
        return Optional.empty();
    }

    /** SHA-256 hex (lowercase 64 ký tự) — dùng lúc seed/cấp key. */
    public static String sha256Hex(String raw) {
        return HexFormat.of().formatHex(sha256(raw));
    }

    private static byte[] sha256(String raw) {
        try {
            return MessageDigest.getInstance("SHA-256")
                .digest(raw.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 không có trong JVM", e);
        }
    }

    private static byte[] sha256HexToBytes(String hex) {
        return HexFormat.of().parseHex(hex);
    }

    /** Sinh raw key mới: {@code pk_} + 32 hex — prefix = 8 ký tự đầu. */
    public static String generateRawKey() {
        String hex = HexFormat.of().formatHex(random32());
        return "pk_" + hex;
    }

    private static byte[] random32() {
        byte[] bytes = new byte[16];
        new java.security.SecureRandom().nextBytes(bytes);
        return bytes;
    }

    /** Sinh webhook secret (32 hex) — partner giữ để verify HMAC. */
    public static String generateWebhookSecret() {
        return HexFormat.of().formatHex(random32());
    }

    /** Prefix nhận diện của raw key (8 ký tự đầu). */
    public static String prefixOf(String rawKey) {
        return rawKey.substring(0, PREFIX_LENGTH);
    }
}
