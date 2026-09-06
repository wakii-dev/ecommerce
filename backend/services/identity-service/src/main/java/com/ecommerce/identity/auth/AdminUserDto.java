package com.ecommerce.identity.auth;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Dòng trong trang admin users (không expose password_hash/status). */
public record AdminUserDto(UUID id, String email, String fullName, List<String> roles, Instant createdAt) {}
