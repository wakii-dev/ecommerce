package com.ecommerce.notification.identity;

import com.ecommerce.notification.config.NotifyProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Service-account client (pattern partner-api GAP-1 interim — REQUIREMENT-GAP
 * FI-310): login qua identity PUBLIC API, token cache hết hạn −60s. Self-healing:
 * login 401 → register (409 tolerate) → login lại. ROLE ADMIN KHÔNG tự gán được
 * qua public API — seed script gán (SQL user_roles); 403 từ ordering → xem log
 * InvoiceClient.
 */
@Component
public class IdentityClient {

    private static final Logger log = LoggerFactory.getLogger(IdentityClient.class);

    private final RestClient rest;
    private final NotifyProperties.ServiceAccount account;
    private final ObjectMapper objectMapper;

    private final AtomicReference<CachedToken> cache = new AtomicReference<>();

    public IdentityClient(RestClient.Builder builder, NotifyProperties props, ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) props.identity().timeoutMs());
        factory.setReadTimeout((int) props.identity().timeoutMs());
        this.rest = builder.requestFactory(factory)
            .baseUrl(props.identity().baseUrl())
            .build();
        this.account = props.serviceAccount();
        this.objectMapper = objectMapper;
    }

    /** Token hợp lệ (cache hoặc login mới). Login 401 → ensure account rồi login lại. */
    public synchronized String getAccessToken() {
        CachedToken cached = cache.get();
        if (cached != null && cached.validUntil().isAfter(Instant.now())) {
            return cached.token();
        }
        try {
            return login();
        } catch (HttpClientErrorException.Unauthorized e) {
            // account chưa tồn tại (hoặc pass đổi) — tự hồi phục
            log.info("[service-account] login 401 — thử register rồi login lại");
            register();
            return login();
        }
    }

    private String login() {
        JsonNode body = objectMapper.valueToTree(Map.of(
            "email", account.email(),
            "password", account.password()));
        JsonNode response = rest.post().uri("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve()
            .body(JsonNode.class);
        if (response == null || response.path("accessToken").asText("").isBlank()) {
            throw new IllegalStateException("Identity login trả thiếu accessToken");
        }
        long expiresIn = response.path("expiresIn").asLong(900);
        String token = response.path("accessToken").asText();
        cache.set(new CachedToken(token, Instant.now().plusSeconds(Math.max(30, expiresIn - 60))));
        log.debug("[service-account] token mới, TTL {}s", expiresIn);
        return token;
    }

    /** Đảm bảo account tồn tại — 409 (đã có) coi như OK. */
    public synchronized void register() {
        JsonNode body = objectMapper.valueToTree(Map.of(
            "email", account.email(),
            "password", account.password(),
            "fullName", account.fullName()));
        try {
            rest.post().uri("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity();
            log.info("[service-account] đã đăng ký {}", account.email());
        } catch (HttpClientErrorException.Conflict e) {
            log.debug("[service-account] {} đã tồn tại", account.email());
        }
    }

    private record CachedToken(String token, Instant validUntil) {
    }
}
