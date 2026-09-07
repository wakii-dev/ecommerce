package com.ecommerce.identity.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Reset password (SF-13 A1) — token từ email link + mật khẩu mới ≥8 (contract). */
public record ResetPasswordRequest(
    @NotBlank String token,
    @NotBlank @Size(min = 8, max = 100) String newPassword) {}
