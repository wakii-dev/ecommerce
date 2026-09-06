package com.ecommerce.identity.auth;

/** 200 của POST /auth/login — refresh token đi qua Set-Cookie (không nằm body). */
public record LoginSuccess(String accessToken, String tokenType, long expiresIn, UserSummary user) {}
