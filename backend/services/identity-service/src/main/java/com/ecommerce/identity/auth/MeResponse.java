package com.ecommerce.identity.auth;

import java.util.List;
import java.util.UUID;

/**
 * GET/PATCH /me. phone trả undocumented (GAP FI-310); twoFactorEnabled luôn
 * false cho tới SF-15.
 */
public record MeResponse(UUID id, String email, String fullName, String phone,
                         List<String> roles, boolean twoFactorEnabled) {}
