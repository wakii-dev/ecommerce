package com.ecommerce.payment.api;

import com.ecommerce.payment.api.dto.CreateIntentRequest;
import com.ecommerce.payment.api.dto.PaymentIntentCreatedResponse;
import com.ecommerce.payment.service.PaymentIntentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Payment API — path KHÔNG prefix `/api` (gateway StripPrefix=1; public path
 * `/api/payment/intents` khớp contract). Ordering gọi sync (spec §3.3 command
 * edge); Stripe gọi webhook (T7).
 */
@RestController
@RequestMapping("/payment")
public class PaymentController {

    private final PaymentIntentService intentService;

    public PaymentController(PaymentIntentService intentService) {
        this.intentService = intentService;
    }

    @PostMapping("/intents")
    public ResponseEntity<PaymentIntentCreatedResponse> createIntent(
        @Valid @RequestBody CreateIntentRequest request,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(intentService.createIntent(request, idempotencyKey));
    }
}
