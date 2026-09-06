package com.ecommerce.payment.api;

import com.ecommerce.payment.api.dto.CreateIntentRequest;
import com.ecommerce.payment.api.dto.PaymentIntentCreatedResponse;
import com.ecommerce.payment.api.dto.RefundCreatedResponse;
import com.ecommerce.payment.api.dto.RefundRequest;
import com.ecommerce.payment.api.dto.VoidRequest;
import com.ecommerce.payment.api.dto.VoidResultResponse;
import com.ecommerce.payment.service.PaymentIntentService;
import com.ecommerce.payment.service.PaymentWebhookService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Payment API — path KHÔNG prefix `/api` (gateway StripPrefix=1; public path
 * `/api/payment/intents` khớp contract). Ordering gọi sync intents/refunds/void
 * (spec §3.3 command edge); Stripe gọi webhook (raw passthrough + HMAC).
 */
@RestController
@RequestMapping("/payment")
public class PaymentController {

    private final PaymentIntentService intentService;
    private final PaymentWebhookService webhookService;

    public PaymentController(PaymentIntentService intentService, PaymentWebhookService webhookService) {
        this.intentService = intentService;
        this.webhookService = webhookService;
    }

    @PostMapping("/intents")
    public ResponseEntity<PaymentIntentCreatedResponse> createIntent(
        @Valid @RequestBody CreateIntentRequest request,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(intentService.createIntent(request, idempotencyKey));
    }

    /** Raw body — chữ ký tính trên bytes, KHÔNG deserialize trước (spec §5.4). */
    @PostMapping(value = "/webhook", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Boolean>> webhook(
        @RequestBody String rawBody,
        @RequestHeader("Stripe-Signature") String signatureHeader
    ) {
        webhookService.handle(rawBody, signatureHeader);
        return ResponseEntity.ok(Map.of("received", true));
    }

    @PostMapping("/refunds")
    public ResponseEntity<RefundCreatedResponse> refund(@Valid @RequestBody RefundRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(intentService.refund(request));
    }

    @PostMapping("/void")
    public ResponseEntity<VoidResultResponse> voidIntent(@Valid @RequestBody VoidRequest request) {
        return ResponseEntity.ok(intentService.voidIntent(request));
    }
}
