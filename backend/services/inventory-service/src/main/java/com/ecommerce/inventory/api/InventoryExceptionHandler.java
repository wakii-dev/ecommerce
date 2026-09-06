package com.ecommerce.inventory.api;

import com.ecommerce.common.web.ApiError;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Map lỗi domain inventory → problem+json. 409 body phải là
 * `ReservationConflictError` (contract): ApiError chuẩn + extension
 * `insufficient[]` — dựng bằng ObjectNode ghép (ApiError là record).
 */
@RestControllerAdvice
public class InventoryExceptionHandler {

    private final ObjectMapper objectMapper;

    public InventoryExceptionHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @ExceptionHandler(InsufficientStockException.class)
    public ResponseEntity<ObjectNode> handleInsufficientStock(InsufficientStockException e) {
        ApiError base = ApiError.of(409, "Insufficient stock", e.getMessage(), null,
            MDC.get("requestId"), null);
        ObjectNode node = objectMapper.valueToTree(base);
        node.set("insufficient", objectMapper.valueToTree(e.getInsufficient()));
        return ResponseEntity.status(409)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(node);
    }
}
