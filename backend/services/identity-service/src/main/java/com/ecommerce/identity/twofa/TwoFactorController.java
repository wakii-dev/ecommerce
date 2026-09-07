package com.ecommerce.identity.twofa;

import com.ecommerce.identity.auth.AuthController;
import com.ecommerce.identity.auth.LoginSuccess;
import com.ecommerce.identity.auth.UserSummary;
import com.ecommerce.identity.config.RefreshProperties;
import com.ecommerce.identity.token.RefreshTokenService;
import com.ecommerce.identity.token.TokenService;
import com.ecommerce.identity.twofa.TwoFactorDtos.DisableRequest;
import com.ecommerce.identity.twofa.TwoFactorDtos.EnableRequest;
import com.ecommerce.identity.twofa.TwoFactorDtos.EnableResponse;
import com.ecommerce.identity.twofa.TwoFactorDtos.SetupResponse;
import com.ecommerce.identity.twofa.TwoFactorDtos.VerifyRequest;
import com.ecommerce.identity.user.UserEntity;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * 2FA TOTP endpoints (SF-15, D22) — browser path qua gateway:
 * POST /api/identity/2fa/setup|enable|disable (JWT), /api/identity/2fa/verify
 * (public — challengeToken thay JWT; freeze contracts/identity.yaml).
 */
@RestController
public class TwoFactorController {

    private final TwoFactorService service;
    private final TokenService tokenService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshProperties refreshProperties;

    public TwoFactorController(TwoFactorService service, TokenService tokenService,
                               RefreshTokenService refreshTokenService, RefreshProperties refreshProperties) {
        this.service = service;
        this.tokenService = tokenService;
        this.refreshTokenService = refreshTokenService;
        this.refreshProperties = refreshProperties;
    }

    @PostMapping("/2fa/setup")
    public SetupResponse setup(@AuthenticationPrincipal Jwt jwt) {
        return service.setup(userId(jwt), jwt.getClaimAsString("email"));
    }

    @PostMapping("/2fa/enable")
    public EnableResponse enable(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody EnableRequest request) {
        return service.enable(userId(jwt), request.code());
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<Void> disable(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DisableRequest request) {
        service.disable(userId(jwt), request.password(), request.code());
        return ResponseEntity.noContent().build();
    }

    /** 200 LoginSuccess (khớp oneOf) + refresh cookie như login thường. */
    @PostMapping("/2fa/verify")
    public ResponseEntity<Object> verify(@Valid @RequestBody VerifyRequest request) {
        TwoFactorService.VerifyOutcome outcome = service.verifyChallenge(request.challengeToken(), request.code());
        if (!outcome.ok()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Challenge hoặc mã không đúng");
        }
        UserEntity user = outcome.user();
        String refreshRaw = refreshTokenService.issue(user);
        LoginSuccess success = new LoginSuccess(tokenService.issue(user), "Bearer",
            tokenService.accessTtlSeconds(),
            new UserSummary(user.getId(), user.getEmail(), user.getFullName(),
                List.of(user.getRole().name())));
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshRaw).toString())
            .body(success);
    }

    private ResponseCookie refreshCookie(String raw) {
        return ResponseCookie.from(AuthController.REFRESH_COOKIE, raw)
            .httpOnly(true)
            .sameSite("Lax")
            .path(refreshProperties.cookiePath())
            .maxAge(refreshTokenService.ttl())
            .build();
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
