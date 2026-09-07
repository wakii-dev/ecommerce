package com.ecommerce.catalog.reviews.web;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.reviews.ReviewService;
import com.ecommerce.catalog.reviews.web.dto.ReviewAdminDto;
import com.ecommerce.catalog.reviews.web.dto.ReviewAdminPageDto;

/**
 * Admin review moderation (SF-8) — path {@code /api/catalog/admin/**} guard
 * ROLE_ADMIN sẵn trong SecurityConfig (SF-4, không đổi). Approve/reject publish
 * outbox {@code review.moderated} + recompute rating aggregate trong 1 tx
 * (ReviewService.moderate). correlationId = header {@code X-Request-Id} của
 * gateway (nullable — Conventions outbox).
 */
@RestController
@RequestMapping("/api/catalog/admin")
public class AdminReviewController {

    private final ReviewService reviewService;

    public AdminReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /** GET /api/catalog/admin/reviews?status=PENDING — moderation queue (contract). */
    @GetMapping("/reviews")
    public ReviewAdminPageDto list(
            @RequestParam(defaultValue = "PENDING") String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return reviewService.adminList(status, page, size);
    }

    /** POST /api/catalog/admin/reviews/{id}/approve — PENDING → APPROVED (contract). */
    @PostMapping("/reviews/{id}/approve")
    public ReviewAdminDto approve(
            @PathVariable UUID id,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        return reviewService.moderate(id, true, requestId);
    }

    /** POST /api/catalog/admin/reviews/{id}/reject — PENDING → REJECTED (contract). */
    @PostMapping("/reviews/{id}/reject")
    public ReviewAdminDto reject(
            @PathVariable UUID id,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        return reviewService.moderate(id, false, requestId);
    }
}
