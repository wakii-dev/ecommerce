package com.ecommerce.identity.auth;

/** 200 của POST /auth/refresh — Set-Cookie mới (rotate) kèm response. */
public record RefreshResponse(String accessToken, long expiresIn) {}
