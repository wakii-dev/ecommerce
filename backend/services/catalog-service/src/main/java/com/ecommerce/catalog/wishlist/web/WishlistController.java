package com.ecommerce.catalog.wishlist.web;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.service.LocaleResolver;
import com.ecommerce.catalog.wishlist.WishlistService;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.wishlist.web.dto.WishlistIdsDto;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Wishlist APIs (SF-8) — khớp contract {@code /api/catalog/me/wishlist*}:
 * GET page (ProductCardPage, resolve locale qua LocaleResolver SF-4 — D17),
 * GET ids (heart state), PUT add idempotent 204, DELETE remove idempotent 204.
 * JWT bắt buộc qua {@code anyRequest().authenticated()} sẵn có.
 */
@RestController
@RequestMapping("/api/catalog/me/wishlist")
public class WishlistController {

    private final WishlistService wishlistService;
    private final LocaleResolver localeResolver;

    public WishlistController(WishlistService wishlistService, LocaleResolver localeResolver) {
        this.wishlistService = wishlistService;
        this.localeResolver = localeResolver;
    }

    @GetMapping
    public ProductCardPageDto wishlist(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String locale,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        return wishlistService.wishlistPage(parseUserId(jwt), localeResolver.resolve(request, locale), page, size);
    }

    @GetMapping("/ids")
    public WishlistIdsDto wishlistIds(@AuthenticationPrincipal Jwt jwt) {
        return wishlistService.wishlistIds(parseUserId(jwt));
    }

    @PutMapping("/{productId}")
    public ResponseEntity<Void> add(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID productId) {
        wishlistService.add(parseUserId(jwt), productId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{productId}")
    public ResponseEntity<Void> remove(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID productId) {
        wishlistService.remove(parseUserId(jwt), productId);
        return ResponseEntity.noContent().build();
    }

    private static UUID parseUserId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            throw WishlistService.bad("Token subject không phải UUID hợp lệ");
        }
    }
}
