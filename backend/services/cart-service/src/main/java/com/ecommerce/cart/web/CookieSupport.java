package com.ecommerce.cart.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Cookie {@code cart_token} (SF-6) — contract cart.yaml: httpOnly +
 * SameSite=Lax. Path scope {@code /api/cart} (chỉ cart endpoints cần).
 * Max-Age = ttl giỏ (30d). Cookie KHÔNG phân biệt port ở localhost (RFC 6265)
 * — nên PDP (:3000/:8080) và shell (:5173) cùng nhìn thấy qua proxy /api.
 */
@Component
public class CookieSupport {

    private final String name;
    private final long maxAgeSeconds;

    public CookieSupport(@Value("${cart.cookie-name:cart_token}") String name,
                         @Value("${cart.ttl-days:30}") long ttlDays) {
        this.name = name;
        this.maxAgeSeconds = daysToSeconds(ttlDays);
    }

    private static long daysToSeconds(long days) {
        return days * 24L * 3600L;
    }

    /** Set-Cookie cấp token guest mới (POST /api/cart, POST /api/cart/items auto-create). */
    public ResponseCookie issue(String token) {
        return ResponseCookie.from(name, token)
            .httpOnly(true)
            .sameSite("Lax")
            .path("/api/cart")
            .maxAge(maxAgeSeconds)
            .build();
    }

    /** Set-Cookie hết hiệu lực sau merge (guest cart đã bị xóa). */
    public ResponseCookie expire() {
        return ResponseCookie.from(name, "")
            .httpOnly(true)
            .sameSite("Lax")
            .path("/api/cart")
            .maxAge(0)
            .build();
    }
}
