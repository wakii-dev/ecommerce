package com.ecommerce.identity.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Đăng nhập — 2FA/OAuth không thuộc SF-3 (D21/D22 — contract freeze sẵn path). */
public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
