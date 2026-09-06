package com.ecommerce.common.web;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

/**
 * Map exception chuẩn → RFC 7807 problem+json (application/problem+json).
 * Services kế thừa qua component-scan {@code com.ecommerce}; error NOT leaked
 * (500 giữ message chung, chi tiết chỉ vào log có requestId).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException e) {
        List<ApiError.FieldViolation> violations = e.getBindingResult().getFieldErrors().stream()
            .map(f -> new ApiError.FieldViolation(f.getField(), f.getDefaultMessage()))
            .toList();
        return problem(HttpStatus.BAD_REQUEST, "Validation failed", "Request body không hợp lệ", violations);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> handleConstraint(ConstraintViolationException e) {
        List<ApiError.FieldViolation> violations = e.getConstraintViolations().stream()
            .map(v -> new ApiError.FieldViolation(String.valueOf(v.getPropertyPath()), v.getMessage()))
            .toList();
        return problem(HttpStatus.BAD_REQUEST, "Validation failed", "Tham số không hợp lệ", violations);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiError> handleUnreadable(Exception e) {
        return problem(HttpStatus.BAD_REQUEST, "Malformed request", "Request không đọc được", null);
    }

    @ExceptionHandler({jakarta.persistence.EntityNotFoundException.class, java.util.NoSuchElementException.class})
    public ResponseEntity<ApiError> handleNotFound(Exception e) {
        return problem(HttpStatus.NOT_FOUND, "Not found", e.getMessage(), null);
    }

    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleConflict(Exception e) {
        return problem(HttpStatus.CONFLICT, "Conflict", "Dữ liệu vi phạm ràng buộc", null);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> handleResponseStatus(ResponseStatusException e) {
        HttpStatus status = HttpStatus.resolve(e.getStatusCode().value());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        return problem(status, status.getReasonPhrase(), e.getReason(), null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "Not found", "Không tìm thấy resource", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception e) {
        log.error("Unhandled exception [requestId={}]", MDC.get("requestId"), e);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error", "Lỗi hệ thống — đã ghi log", null);
    }

    private ResponseEntity<ApiError> problem(HttpStatus status, String title, String detail,
                                             List<ApiError.FieldViolation> errors) {
        ApiError body = ApiError.of(status.value(), title, detail, null, MDC.get("requestId"), errors);
        return ResponseEntity.status(status)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(body);
    }
}
