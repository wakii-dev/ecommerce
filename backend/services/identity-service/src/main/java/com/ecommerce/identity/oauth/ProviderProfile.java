package com.ecommerce.identity.oauth;

/** Profile provider trả về sau khi đổi code — chuẩn hóa để find-or-create. */
public record ProviderProfile(String provider, String providerId, String email,
                              boolean emailVerified, String name) {
}
