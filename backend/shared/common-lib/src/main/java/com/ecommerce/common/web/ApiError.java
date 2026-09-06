package com.ecommerce.common.web;

import java.time.Instant;
import java.util.List;

/**
 * Body lỗi chuẩn RFC 7807 (application/problem+json) cho toàn bộ services.
 * {@code GlobalExceptionHandler} sinh ra; services ném exception chuẩn,
 * không tự dựng body lỗi.
 */
public record ApiError(
    String type,
    String title,
    int status,
    String detail,
    String instance,
    Instant timestamp,
    String requestId,
    List<FieldViolation> errors
) {

    public record FieldViolation(String field, String message) {
    }

    public static ApiError of(int status, String title, String detail, String instance,
                              String requestId, List<FieldViolation> errors) {
        return new ApiError(
            "about:blank",
            title,
            status,
            detail,
            instance,
            Instant.now(),
            requestId,
            errors == null ? List.of() : errors
        );
    }
}
