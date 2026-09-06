package com.ecommerce.identity.auth;

import java.util.List;
import java.util.UUID;

/** User tối thiểu cho FE (roles là MẢNG — pack pin, role single column ở DB). */
public record UserSummary(UUID id, String email, String fullName, List<String> roles) {}
