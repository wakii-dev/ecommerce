package com.ecommerce.identity.newsletter;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/**
 * Admin danh sách subscriber (SF-13 A8) — path `/admin/newsletter` (URL
 * `/api/identity/admin/newsletter`): NẰM TRONG guard `/admin/**` hasRole(ADMIN)
 * của SecurityConfig + gateway admin-prefix `/api/identity/admin/**` (2 lớp —
 * review spec-critic P1: đặt trong NewsletterController sẽ thành
 * /api/identity/newsletter/admin — LỚN CẢ HAI guard → lộ danh sách).
 */
@RestController
@RequestMapping("/admin")
public class AdminNewsletterController {

    public record NewsletterItem(String email, Instant createdAt) {
    }

    public record NewsletterPageDto(List<NewsletterItem> items, int page, int size, long total) {
    }

    private final NewsletterRepository subscriptions;

    public AdminNewsletterController(NewsletterRepository subscriptions) {
        this.subscriptions = subscriptions;
    }

    @GetMapping("/newsletter")
    public NewsletterPageDto list(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "50") int size) {
        Page<NewsletterSubscriptionEntity> result = subscriptions.findAllByOrderByCreatedAtDesc(
            PageRequest.of(Math.max(page, 1) - 1, Math.min(Math.max(size, 1), 100)));
        return new NewsletterPageDto(
            result.getContent().stream()
                .map(e -> new NewsletterItem(e.getEmail(), e.getCreatedAt()))
                .toList(),
            page, Math.min(size, 100), result.getTotalElements());
    }
}
