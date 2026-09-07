package com.ecommerce.identity.twofa;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/** DTO 2FA — shape khớp contracts/openapi/identity.yaml (freeze SF-2). */
public final class TwoFactorDtos {

    private TwoFactorDtos() {}

    /** POST /2fa/setup 200 — QR render client-side từ otpauthUrl. */
    public record SetupResponse(String secret, String otpauthUrl) {}

    public record EnableRequest(@NotBlank String code) {}

    /** POST /2fa/enable 200 — recovery codes plaintext, chỉ hiện 1 lần. */
    public record EnableResponse(List<String> recoveryCodes) {}

    /**
     * POST /2fa/disable — body contract {password} required; `code` là
     * additional property OPTIONAL (pack ACCEPTANCE "password + mã" không thể
     * hiện trong schema freeze — REQUIREMENT-GAP #2 FI-310; thiếu code → 400).
     */
    public record DisableRequest(@NotBlank String password, String code) {}

    public record VerifyRequest(@NotBlank String challengeToken, @NotBlank String code) {}

    /** Login branch khi user bật 2FA — HTTP 200, khớp oneOf LoginResponse. */
    public record Challenge(boolean twoFactorRequired, String challengeToken) {}
}
