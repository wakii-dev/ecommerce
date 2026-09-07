package com.ecommerce.identity.oauth;

import com.ecommerce.identity.auth.AuthController;
import com.ecommerce.identity.auth.LoginSuccess;
import com.ecommerce.identity.config.RefreshProperties;
import com.ecommerce.identity.token.RefreshTokenService;
import com.ecommerce.identity.token.TokenService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Duration;
import java.util.Map;

/**
 * OAuth endpoints (SF-15, D22) — browser path qua gateway:
 * GET /api/identity/oauth/{provider}/authorize → 302 provider
 * GET /api/identity/oauth/{provider}/callback → 302 FE ?code|error
 * POST /api/identity/oauth/exchange → LoginSuccess + Set-Cookie refresh
 * GET /.well-known/oauth-providers → {google,facebook} (nút login ẩn/hiện)
 * (authorize+callback frozen contracts/identity.yaml; exchange + well-known
 * additive — ADR 0005 + REQUIREMENT-GAP FI-310.)
 */
@RestController
public class OAuthController {

    /** Cookie name thống nhất với login thường (AuthController). */
    static final String REFRESH_COOKIE = AuthController.REFRESH_COOKIE;

    private final OAuthService oauthService;
    private final OAuthProperties props;
    private final RefreshTokenService refreshTokenService;
    private final RefreshProperties refreshProperties;

    public OAuthController(OAuthService oauthService, OAuthProperties props,
                           RefreshTokenService refreshTokenService, RefreshProperties refreshProperties) {
        this.oauthService = oauthService;
        this.props = props;
        this.refreshTokenService = refreshTokenService;
        this.refreshProperties = refreshProperties;
    }

    @GetMapping("/oauth/{provider}/authorize")
    public ResponseEntity<Void> authorize(@PathVariable String provider) {
        String url = oauthService.authorizeUrl(provider);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(url)).build();
    }

    @GetMapping("/oauth/{provider}/callback")
    public ResponseEntity<Void> callback(@PathVariable String provider,
                                         @RequestParam(required = false) String code,
                                         @RequestParam(required = false) String error,
                                         @RequestParam(required = false) String state) {
        String feUrl = oauthService.callback(provider, code, error, state);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(feUrl)).build();
    }

    @PostMapping("/oauth/exchange")
    public ResponseEntity<LoginSuccess> exchange(@Valid @RequestBody ExchangeRequest request) {
        OAuthService.ExchangeResult result = oauthService.exchange(request.code());
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(result.refreshRaw()).toString())
            .body(result.success());
    }

    @GetMapping("/.well-known/oauth-providers")
    public Map<String, Boolean> providers() {
        return Map.of(
            "google", props.google() != null && props.google().configured(),
            "facebook", props.facebook() != null && props.facebook().configured());
    }

    private ResponseCookie refreshCookie(String raw) {
        return ResponseCookie.from(REFRESH_COOKIE, raw)
            .httpOnly(true)
            .sameSite("Lax")
            .path(refreshProperties.cookiePath())
            .maxAge(refreshTokenService.ttl())
            .build();
    }

    public record ExchangeRequest(@NotBlank String code) {}
}
