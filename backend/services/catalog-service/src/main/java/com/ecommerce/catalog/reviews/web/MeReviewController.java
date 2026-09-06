package com.ecommerce.catalog.reviews.web;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.reviews.ReviewService;
import com.ecommerce.catalog.reviews.web.dto.MeReviewDto;
import com.ecommerce.catalog.reviews.web.dto.MeReviewPageDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewSubmitRequest;

/**
 * Me reviews APIs (SF-8) — ADDITIVE ngoài contract catalog.yaml (không phá
 * freeze; REQUIREMENT-GAP FI-310 — spec Q1). JWT bắt buộc qua
 * {@code anyRequest().authenticated()} của SecurityConfig sẵn có. Endpoint:
 *
 * <ul>
 *   <li>GET /api/catalog/me/reviews?productId=&amp;page=&amp;size= — mọi status</li>
 *   <li>PUT /api/catalog/me/reviews/{id} — chỉ PENDING (200)</li>
 *   <li>DELETE /api/catalog/me/reviews/{id} — chỉ PENDING (204)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/catalog/me/reviews")
public class MeReviewController {

    private final ReviewService reviewService;

    public MeReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping
    public MeReviewPageDto list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) UUID productId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return reviewService.meList(parseUserId(jwt), productId, page, size);
    }

    @PutMapping("/{id}")
    public MeReviewDto edit(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody ReviewSubmitRequest request) {
        return reviewService.editMine(parseUserId(jwt), id, request, ReviewController.resolveUserName(jwt));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id) {
        reviewService.deleteMine(parseUserId(jwt), id);
        return ResponseEntity.noContent().build();
    }

    private static UUID parseUserId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            throw ReviewService.bad("Token subject không phải UUID hợp lệ");
        }
    }
}
