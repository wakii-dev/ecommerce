package com.ecommerce.identity.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Forgot password (SF-13 A1) — response LUÔN 202, không lộ email tồn tại. */
public record ForgotPasswordRequest(@NotBlank @Email String email) {}
