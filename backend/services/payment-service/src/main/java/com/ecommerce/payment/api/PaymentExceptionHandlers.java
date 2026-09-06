package com.ecommerce.payment.api;

import com.ecommerce.common.web.ApiError;
import com.ecommerce.payment.spi.PaymentUnconfiguredException;
import com.ecommerce.payment.spi.ProviderConflictException;
import com.ecommerce.payment.spi.ProviderUnavailableException;
import com.ecommerce.payment.spi.WebhookVerificationException;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Phân loại lỗi payment → problem+json (spec §6): 503 payment_unconfigured ·
 * 400 webhook sig · 409 payment_conflict (Stripe InvalidRequest — refund vượt/
 * already refunded) · 502 payment_provider_error (hạ tầng). KHÔNG leak message
 * nội bộ qua 500.
 */
@RestControllerAdvice
public class PaymentExceptionHandlers {

    @ExceptionHandler(PaymentUnconfiguredException.class)
    public ResponseEntity<ApiError> unconfigured(PaymentUnconfiguredException e) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "payment_unconfigured", e.getMessage());
    }

    @ExceptionHandler(WebhookVerificationException.class)
    public ResponseEntity<ApiError> webhookSignature(WebhookVerificationException e) {
        return problem(HttpStatus.BAD_REQUEST, "webhook_signature_invalid",
            "Chữ ký Stripe-Signature không hợp lệ hoặc thiếu");
    }

    /** Thiếu header Stripe-Signature → 400 (common-lib catch-all sẽ 500 — không đúng contract webhook). */
    @ExceptionHandler(org.springframework.web.bind.MissingRequestHeaderException.class)
    public ResponseEntity<ApiError> missingSignatureHeader(
        org.springframework.web.bind.MissingRequestHeaderException e) {
        return problem(HttpStatus.BAD_REQUEST, "webhook_signature_invalid",
            "Thiếu header " + e.getHeaderName() + " — không verify được webhook");
    }

    @ExceptionHandler(ProviderConflictException.class)
    public ResponseEntity<ApiError> providerConflict(ProviderConflictException e) {
        return problem(HttpStatus.CONFLICT, "payment_conflict",
            "Provider từ chối lệnh — trạng thái không cho phép (đã refund hết / chưa capture...)");
    }

    @ExceptionHandler(ProviderUnavailableException.class)
    public ResponseEntity<ApiError> providerUnavailable(ProviderUnavailableException e) {
        return problem(HttpStatus.BAD_GATEWAY, "payment_provider_error",
            "Provider tạm lỗi — thử lại sau (intent chưa được tạo)");
    }

    private ResponseEntity<ApiError> problem(HttpStatus status, String title, String detail) {
        ApiError body = ApiError.of(status.value(), title, detail, null, MDC.get("requestId"), null);
        return ResponseEntity.status(status)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(body);
    }
}
