package com.ecommerce.identity.oauth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * OAuth Google/Facebook (SF-15, D22) — endpoint URI ghi default thật và CHO
 * PHÉP override qua env để IT trỏ vào WireMock (pattern payment-service).
 * Không có client-id/secret → provider "không cấu hình": authorize 400,
 * well-known trả false → FE ẩn nút (pack: "không có key → nút login ẩn").
 */
@ConfigurationProperties(prefix = "identity.oauth")
public record OAuthProperties(
    Provider google,
    Provider facebook,
    String publicBaseUrl,
    String feRedirectBaseUrl
) {

    /** redirect_uri gửi provider — gateway public base (default http://localhost:8080). */
    public String redirectUri(String provider) {
        return publicBaseUrl + "/api/identity/oauth/" + provider + "/callback";
    }

    /** null nếu provider không google/facebook (controller tự 400). */
    public Provider provider(String name) {
        if (name == null) return null;
        return switch (name) {
            case "google" -> google;
            case "facebook" -> facebook;
            default -> null;
        };
    }

    public record Provider(
        String clientId,
        String secret,
        String authorizeUri,
        String tokenUri,
        String userInfoUri,
        String scope
    ) {
        public boolean configured() {
            return clientId != null && !clientId.isBlank() && secret != null && !secret.isBlank();
        }
    }
}
