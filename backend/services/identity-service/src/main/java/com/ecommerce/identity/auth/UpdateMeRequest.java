package com.ecommerce.identity.auth;

import jakarta.validation.constraints.Size;

/** PATCH /me — partial: field null = không đổi (Bean Validation bỏ qua null). */
public record UpdateMeRequest(
    @Size(min = 1, max = 255) String fullName,
    @Size(max = 32) String phone) {}
