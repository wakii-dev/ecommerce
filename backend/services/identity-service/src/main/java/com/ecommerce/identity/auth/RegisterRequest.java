package com.ecommerce.identity.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Đăng ký — khớp contract identity.yaml (password ≥8, fullName ≥1). */
public record RegisterRequest(
    @NotBlank @Email String email,
    @NotBlank @Size(min = 8, max = 100) String password,
    @NotBlank @Size(min = 1, max = 255) String fullName) {}
