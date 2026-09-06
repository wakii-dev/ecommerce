package com.ecommerce.catalog.reviews.web;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.reviews.ReviewService;
import com.ecommerce.catalog.reviews.web.dto.ReviewListDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewSubmitRequest;

/**
 * Review APIs public (SF-8) — FULL prefix {@code /api/catalog} (Conventions
 * #11, như ProductController). POST cần JWT (SecurityConfig
 * {@code anyRequest().authenticated()}); GET public permitAll sẵn cho
 * {@code /api/catalog/products/**}. Response 202 NO-BODY theo contract.
 */
@RestController
@RequestMapping("/api/catalog")
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /**
     * POST /api/catalog/products/{slug}/reviews — submit review (JWT).
     * user_id = claim {@code sub}; user_name = claim {@code fullName} fallback
     * email local-part (TokenService identity always set fullName — fallback
     * phòng token legacy). 202 no-body — FE toast client-side.
     */
    @PostMapping("/products/{slug}/reviews")
    public ResponseEntity<Void> submit(
            @PathVariable String slug,
            @RequestBody ReviewSubmitRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        UUID userId = parseUserId(jwt);
        String userName = resolveUserName(jwt);
        reviewService.submit(slug, request, userId, userName);
        return ResponseEntity.accepted().build();
    }

    /** GET /api/catalog/products/{slug}/reviews — chỉ APPROVED + breakdown (contract). */
    @GetMapping("/products/{slug}/reviews")
    public ReviewListDto list(
            @PathVariable String slug,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return reviewService.list(slug, page, size);
    }

    private static UUID parseUserId(Jwt jwt) {
        String sub = jwt.getSubject();
        try {
            return UUID.fromString(sub);
        } catch (IllegalArgumentException e) {
            throw ReviewService.bad("Token subject không phải UUID hợp lệ");
        }
    }

    /** fullName claim fallback email local-part — MeReviewController tái dùng (cùng slice). */
    static String resolveUserName(Jwt jwt) {
        String fullName = jwt.getClaimAsString("fullName");
        if (fullName != null && !fullName.isBlank()) {
            String trimmed = fullName.trim();
            return trimmed.length() > 255 ? trimmed.substring(0, 255) : trimmed;
        }
        String email = jwt.getClaimAsString("email");
        if (email != null && email.contains("@")) {
            return email.substring(0, email.indexOf('@'));
        }
        return "Thành viên";
    }
}
