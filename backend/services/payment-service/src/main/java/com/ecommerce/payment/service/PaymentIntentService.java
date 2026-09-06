package com.ecommerce.payment.service;

import com.ecommerce.payment.api.dto.CreateIntentRequest;
import com.ecommerce.payment.api.dto.PaymentIntentCreatedResponse;
import com.ecommerce.payment.domain.PaymentIntent;
import com.ecommerce.payment.repo.PaymentIntentRepository;
import com.ecommerce.payment.spi.AdapterIntent;
import com.ecommerce.payment.spi.IntentCommand;
import com.ecommerce.payment.spi.PaymentProviderAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

/**
 * Intents API — idempotent replay theo {@code Idempotency-Key} (header chính —
 * pack; body `idempotencyKey` fallback — contract): same key + same payload →
 * trả lại kết quả cũ; same key + khác payload → 409 (spec §5.3).
 *
 * <p>Adapter lỗi giữa chừng: KHÔNG persist row (insert chỉ chạy SAU adapter
 * thành công — atomic 1 statement, replay không bao giờ gặp row thiếu pi_).
 * Race 2 request cùng key: unique index chặn INSERT thứ 2 → catch → replay.</p>
 */
@Service
public class PaymentIntentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentIntentService.class);
    private static final String SUPPORTED_CURRENCY = "VND";

    private final PaymentIntentRepository intents;
    private final PaymentProviderAdapter adapter;

    public PaymentIntentService(PaymentIntentRepository intents, PaymentProviderAdapter adapter) {
        this.intents = intents;
        this.adapter = adapter;
    }

    public PaymentIntentCreatedResponse createIntent(CreateIntentRequest request, String headerKey) {
        String idempotencyKey = resolveKey(request, headerKey);
        if (request.amount() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount phải > 0 (VND zero-decimal)");
        }
        if (!SUPPORTED_CURRENCY.equalsIgnoreCase(request.currency())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "currency chỉ hỗ trợ VND (contract enum)");
        }

        String payloadHash = payloadHash(request.orderId(), request.amount());

        PaymentIntent existing = intents.findByIdempotencyKey(idempotencyKey).orElse(null);
        if (existing != null) {
            if (!existing.getPayloadHash().equals(payloadHash)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Idempotency-Key đã dùng cho payload khác — dùng key mới (UUID 1 lần/intent)");
            }
            return toResponse(existing);
        }

        try {
            AdapterIntent created = adapter.createIntent(
                new IntentCommand(request.orderId(), request.amount(), SUPPORTED_CURRENCY, idempotencyKey));
            PaymentIntent intent = new PaymentIntent(
                request.orderId(), request.amount(), SUPPORTED_CURRENCY, idempotencyKey, payloadHash);
            intent.markCreated(created);
            PaymentIntent saved = intents.saveAndFlush(intent);
            log.info("Intent {} tạo cho order {} (amount {} VND)", created.providerIntentId(),
                request.orderId(), request.amount());
            return toResponse(saved);
        } catch (DataIntegrityViolationException e) {
            // race 2 request cùng key — cái đã thắng insert trả kết quả
            PaymentIntent winner = intents.findByIdempotencyKey(idempotencyKey)
                .orElseThrow(() -> e);
            return toResponse(winner);
        }
    }

    private String resolveKey(CreateIntentRequest request, String headerKey) {
        if (headerKey != null && !headerKey.isBlank()) {
            return headerKey;
        }
        if (request.idempotencyKey() != null && !request.idempotencyKey().isBlank()) {
            return request.idempotencyKey();
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Thiếu Idempotency-Key (header hoặc body idempotencyKey) — ordering sinh UUID 1 lần/intent");
    }

    /** sha256(orderId|amount|currency) — replay cùng key khác payload → 409. */
    private String payloadHash(String orderId, long amount) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(
                (orderId + "|" + amount + "|" + SUPPORTED_CURRENCY).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 không khả dụng", e);
        }
    }

    private PaymentIntentCreatedResponse toResponse(PaymentIntent intent) {
        return new PaymentIntentCreatedResponse(
            intent.getStripeIntentId(), intent.getClientSecret(), intent.getStripeStatus());
    }
}
