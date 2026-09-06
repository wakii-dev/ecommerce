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
        // Contract 409 case 2: "order đã có intent active" — chặn double-charge
        // (cùng order + key MỚI → pi_ thứ 2). Retry đúng (= same key) đã replay ở trên.
        if (intents.existsByOrderIdAndStatusIn(
            request.orderId(), java.util.List.of(
                com.ecommerce.payment.domain.PaymentIntentStatus.CREATED,
                com.ecommerce.payment.domain.PaymentIntentStatus.REQUIRES_CONFIRMATION))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Order đã có intent active — retry phải dùng CÙNG Idempotency-Key");
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
            // (re-check hash: same-key-khác-payload phải 409, không nhầm 201)
            PaymentIntent winner = intents.findByIdempotencyKey(idempotencyKey)
                .filter(w -> w.getPayloadHash().equals(payloadHash))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                    "Idempotency-Key đã dùng cho payload khác"));
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

    /**
     * Refund (spec §5.5): precheck LOCAL trước adapter — 404 không có pi_, 409
     * status != SUCCEEDED (chưa capture). Full refund (amount null hoặc == amount)
     * → REFUNDED; partial giữ SUCCEEDED. KHÔNG publish event (ordering nhận sync
     * response — coordination note SF-9). Cumulative-refund tracking delegate
     * Stripe (refund vượt amount → ProviderConflict → 409 payment_conflict).
     */
    public com.ecommerce.payment.api.dto.RefundCreatedResponse refund(
        com.ecommerce.payment.api.dto.RefundRequest request, String idempotencyKey) {
        PaymentIntent intent = intents.findByStripeIntentId(request.paymentIntentId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "paymentIntentId không tồn tại"));
        if (intent.getStatus() != com.ecommerce.payment.domain.PaymentIntentStatus.SUCCEEDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Intent chưa capture thành công — không refund được (status " + intent.getStatus() + ")");
        }
        boolean full = request.amount() == null || request.amount() == intent.getAmountVnd();
        com.ecommerce.payment.spi.AdapterRefund refund = adapter.refund(
            intent.getStripeIntentId(), request.amount(), idempotencyKey);
        if (full) {
            intent.markStatus(com.ecommerce.payment.domain.PaymentIntentStatus.REFUNDED);
            intents.save(intent);
        }
        return new com.ecommerce.payment.api.dto.RefundCreatedResponse(
            refund.refundId(), refund.status(), refund.amount());
    }

    /**
     * Void (spec §5.5): chỉ CREATED/REQUIRES_CONFIRMATION (chưa capture); đã
     * SUCCEEDED → refund path. Response status = mirror (CANCELED) — DB = VOIDED.
     */
    public com.ecommerce.payment.api.dto.VoidResultResponse voidIntent(
        com.ecommerce.payment.api.dto.VoidRequest request, String idempotencyKey) {
        PaymentIntent intent = intents.findByStripeIntentId(request.paymentIntentId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "paymentIntentId không tồn tại"));
        if (intent.getStatus() != com.ecommerce.payment.domain.PaymentIntentStatus.CREATED
            && intent.getStatus() != com.ecommerce.payment.domain.PaymentIntentStatus.REQUIRES_CONFIRMATION) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Intent đã capture/void — không void được nữa (status " + intent.getStatus() + ")");
        }
        com.ecommerce.payment.spi.AdapterIntent canceled = adapter.voidIntent(
            intent.getStripeIntentId(), idempotencyKey);
        intent.markStatus(com.ecommerce.payment.domain.PaymentIntentStatus.VOIDED);
        intent.markStripeStatus(canceled.status());
        intents.save(intent);
        return new com.ecommerce.payment.api.dto.VoidResultResponse(canceled.status());
    }
}
