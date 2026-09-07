package com.ecommerce.affiliate.api;

import com.ecommerce.affiliate.api.dto.AffiliateDtos.AffiliatePendingResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.AffiliateProfileResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.LedgerEntryResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.PageResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.RegisterRequest;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.TrackClickRequest;
import com.ecommerce.affiliate.config.AffiliateProperties;
import com.ecommerce.affiliate.service.AffiliateService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * API affiliate (contract affiliate.yaml, tag "affiliate") — controllers map
 * FULL /api/affiliate/** (gateway route không StripPrefix, precedent catalog).
 * Track click là endpoint DUY NHẤT public — cookie {@code aff_ref} do service
 * quản (contract: "cookie window do service quản").
 */
@RestController
@RequestMapping("/api/affiliate")
public class AffiliateController {

    private final AffiliateService affiliateService;
    private final AffiliateProperties props;
    private final String cookieDomain;

    public AffiliateController(AffiliateService affiliateService, AffiliateProperties props,
                               @Value("${affiliate.cookie-domain:}") String cookieDomain) {
        this.affiliateService = affiliateService;
        this.props = props;
        this.cookieDomain = cookieDomain;
    }

    /** POST /api/affiliate/register — 202 chờ duyệt (không auto-approve). */
    @PostMapping("/register")
    public ResponseEntity<AffiliatePendingResponse> register(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody RegisterRequest request) {
        AffiliatePendingResponse pending =
            affiliateService.register(currentUserId(jwt), request.portfolioUrl(), request.note());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(pending);
    }

    /** GET /api/affiliate/me — hồ sơ + code + rate + stats tổng. */
    @GetMapping("/me")
    public AffiliateProfileResponse me(@AuthenticationPrincipal Jwt jwt) {
        return affiliateService.me(currentUserId(jwt));
    }

    /** GET /api/affiliate/me/ledger?page= — sổ hoa hồng (page 1-based). */
    @GetMapping("/me/ledger")
    public PageResponse<LedgerEntryResponse> myLedger(
        @AuthenticationPrincipal Jwt jwt,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size) {
        return affiliateService.myLedger(currentUserId(jwt), page, size);
    }

    /**
     * POST /api/affiliate/track/click — PUBLIC (storefront capture {@code ?ref}).
     * 204 LUÔN (kể cả code sai — im lặng tránh lộ trạng thái, contract);
     * code APPROVED → Set-Cookie aff_ref 30 ngày httpOnly path=/.
     */
    @PostMapping("/track/click")
    public ResponseEntity<Void> trackClick(@Valid @RequestBody TrackClickRequest request,
                                           HttpServletRequest http) {
        AffiliateService.ClickCaptureResult result = affiliateService.trackClick(
            request.refCode().trim(),
            clientIp(http),
            http.getHeader("User-Agent")
        );
        if (result.cookieValue() == null) {
            return ResponseEntity.noContent().build();
        }
        ResponseCookie cookie = buildAttributionCookie(result.cookieValue());
        return ResponseEntity.noContent()
            .header("Set-Cookie", cookie.toString())
            .build();
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ResponseCookie buildAttributionCookie(String code) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie
            .from(props.getCookieName(), code)
            .httpOnly(true)
            .path("/")
            .maxAge(props.getCookieMaxAgeSeconds())
            .sameSite("Lax");
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            builder.domain(cookieDomain);
        }
        return builder.build();
    }

    /** IP client — X-Forwarded-For (gateway/proxy) else remoteAddr. */
    private static String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }

    static UUID currentUserId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
