package com.ecommerce.payment.api;

import com.ecommerce.payment.api.dto.CodCaptureRequest;
import com.ecommerce.payment.service.CodCaptureService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /payment/cod/captures (SF-13 A2) — ordering gọi nội bộ lúc deliver
 * (HTTP thẳng :8086, không qua gateway — command edge §3.2). Runtime endpoint
 * additive NGOÀI payment.yaml freeze (ADR 0005). Gateway StripPrefix=1:
 * /api/payment/cod/captures → /payment/cod/captures.
 */
@RestController
@RequestMapping("/payment")
public class CodCaptureController {

    public record CodCapturedResponse(String paymentIntentId, String status, boolean replay) {
    }

    private final CodCaptureService service;

    public CodCaptureController(CodCaptureService service) {
        this.service = service;
    }

    @PostMapping("/cod/captures")
    public ResponseEntity<CodCapturedResponse> capture(@Valid @RequestBody CodCaptureRequest request) {
        var captured = service.capture(request.orderId(), request.amountVnd(), request.idempotencyKey());
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(new CodCapturedResponse(captured.paymentIntentId(), captured.status(), captured.replay()));
    }
}
