package com.ecommerce.ordering.api;

import com.ecommerce.common.web.ApiError;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;
import java.util.Map;

/**
 * Lỗi saga/domain → problem+json đúng contract:
 * 409 insufficient[] (CreateOrderConflictError) · 422 coupon/item · 409 state ·
 * 502 catalog/inventory/payment · 503 invoice (D18 degraded rõ ràng).
 * GlobalExceptionHandler (common-lib) lo phần còn lại (400 validation, 404...).
 *
 * <p>{@code @Order(HIGHEST_PRECEDENCE)}: advices unordered so theo thứ tự đăng
 * ký bean — GlobalExceptionHandler (có catch-all Exception) đứng trước theo tên
 * bean thì NHẬN MỌI exception của advice này (409/422/502/503 chết → 500 mù).
 * Advice đặc thù service phải có quyền ưu tiên trước catch-all chung.</p>
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class OrderingExceptionHandler {

    /** 409 het-ton-kho — body có thêm `insufficient[]` (contract CreateOrderConflictError). */
    @ExceptionHandler(InsufficientStockException.class)
    public ResponseEntity<Map<String, Object>> insufficientStock(InsufficientStockException e) {
        Map<String, Object> body = baseBody(HttpStatus.CONFLICT.value(), "Conflict", e.getMessage());
        body.put("insufficient", e.getInsufficient());
        return problem(body);
    }

    @ExceptionHandler({IdempotencyConflictException.class, InvalidStateTransitionException.class,
        RmaWindowException.class})
    public ResponseEntity<Map<String, Object>> conflict(RuntimeException e) {
        return problem(baseBody(HttpStatus.CONFLICT.value(), "Conflict", e.getMessage()));
    }

    /** 400 — lines RMA không khớp đơn (lineId lạ / qty vượt line). */
    @ExceptionHandler(InvalidRmaLinesException.class)
    public ResponseEntity<Map<String, Object>> badRmaLines(InvalidRmaLinesException e) {
        return problem(baseBody(HttpStatus.BAD_REQUEST.value(), "Bad Request", e.getMessage()));
    }

    /** 422 — coupon sai/hết, product/variant không còn (§6.1.2), COD/điểm chưa hỗ trợ. */
    @ExceptionHandler({CouponInvalidException.class, UnsupportedFeatureException.class,
        PointsInvalidException.class})
    public ResponseEntity<Map<String, Object>> unprocessable(CouponInvalidException e) {
        return problem(baseBody(HttpStatus.UNPROCESSABLE_ENTITY.value(), "Unprocessable", e.getMessage()));
    }

    @ExceptionHandler(ItemUnavailableException.class)
    public ResponseEntity<Map<String, Object>> itemUnavailable(ItemUnavailableException e) {
        return problem(baseBody(HttpStatus.UNPROCESSABLE_ENTITY.value(), "Unprocessable", e.getMessage()));
    }

    @ExceptionHandler(InvalidShippingMethodException.class)
    public ResponseEntity<Map<String, Object>> badShipping(InvalidShippingMethodException e) {
        return problem(baseBody(HttpStatus.BAD_REQUEST.value(), "Bad Request", e.getMessage()));
    }

    /** 502 — catalog/inventory/payment hạ tầng lỗi (saga đã compensation trước khi ném). */
    @ExceptionHandler({PricingUnavailableException.class, PaymentUnavailableException.class,
        ExternalUnavailableException.class})
    public ResponseEntity<Map<String, Object>> upstream(RuntimeException e) {
        return problem(baseBody(HttpStatus.BAD_GATEWAY.value(), "Bad Gateway", e.getMessage()));
    }

    /** 503 — invoice-service down (D18: degraded rõ ràng như Stripe, không crash). */
    @ExceptionHandler(InvoiceUnavailableException.class)
    public ResponseEntity<Map<String, Object>> invoiceDown(InvoiceUnavailableException e) {
        return problem(baseBody(HttpStatus.SERVICE_UNAVAILABLE.value(), "Service Unavailable", e.getMessage()));
    }

    private Map<String, Object> baseBody(int status, String title, String detail) {
        // Map + LinkedHashMap (KHÔNG Map.of — immutable → put("insufficient") ở
        // 409 stock ném UnsupportedOperationException → handler tự chết → 500)
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("type", "about:blank");
        body.put("title", title);
        body.put("status", status);
        body.put("detail", detail);
        body.put("timestamp", java.time.Instant.now().toString());
        body.put("requestId", MDC.get("requestId") == null ? "" : MDC.get("requestId"));
        return body;
    }

    private ResponseEntity<Map<String, Object>> problem(Map<String, Object> body) {
        return ResponseEntity.status((int) body.get("status"))
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(body);
    }
}
