package com.ecommerce.payment.service;

import com.ecommerce.payment.domain.PaymentIntent;
import com.ecommerce.payment.domain.PaymentIntentStatus;
import com.ecommerce.payment.repo.PaymentIntentRepository;
import com.ecommerce.payment.spi.AdapterIntent;
import com.ecommerce.payment.spi.CodPaymentAdapter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;

/**
 * Capture tiền COD lúc giao hàng thành công (SF-13 A2): ghi nhận PaymentIntent
 * {@code SUCCEEDED} với id quy ước {@code cod:<orderId>} — "COD→PAID lúc giao"
 * theo contract ordering.yaml. KHÔNG publish payment.succeeded (đơn đã terminal
 * DELIVERED — event đó chỉ cho luồng Stripe webhook, tránh late-refund path).
 *
 * <p>Idempotent: (1) cùng Idempotency-Key → replay; (2) key khác nhưng intent
 * {@code cod:<orderId>} đã có (unique stripe_intent_id) → replay.</p>
 */
@Service
public class CodCaptureService {

    public record Captured(String paymentIntentId, String status, boolean replay) {
    }

    private final PaymentIntentRepository intents;

    public CodCaptureService(PaymentIntentRepository intents) {
        this.intents = intents;
    }

    @Transactional
    public Captured capture(String orderId, long amountVnd, String idempotencyKey) {
        Optional<PaymentIntent> replay = intents.findByIdempotencyKey(idempotencyKey)
            .or(() -> intents.findByStripeIntentId(CodPaymentAdapter.codIntentId(orderId)));
        if (replay.isPresent()) {
            PaymentIntent existing = replay.get();
            return new Captured(existing.getStripeIntentId(), existing.getStatus().name().toLowerCase(), true);
        }

        PaymentIntent intent = new PaymentIntent(orderId, amountVnd, "VND", idempotencyKey, payloadHash(orderId, amountVnd));
        // markCreated gắn stripeIntentId=cod:<orderId> + mirror "succeeded"; đẩy
        // lifecycle nội bộ lên SUCCEEDED ngay (tiền mặt đã thu tận tay).
        intent.markCreated(new AdapterIntent(CodPaymentAdapter.codIntentId(orderId), null, "succeeded"));
        intent.markStatus(PaymentIntentStatus.SUCCEEDED);
        try {
            intents.saveAndFlush(intent);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // RACE 2 capture song song (khác key) — unique stripe_intent_id thắng
            // chèn trước; replay row của nó (convention PaymentIntentService)
            PaymentIntent winner = intents.findByStripeIntentId(CodPaymentAdapter.codIntentId(orderId))
                .orElseThrow(() -> e);
            return new Captured(winner.getStripeIntentId(), winner.getStatus().name().toLowerCase(), true);
        }
        return new Captured(intent.getStripeIntentId(), "succeeded", false);
    }

    private String payloadHash(String orderId, long amountVnd) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String raw = orderId + "|" + amountVnd + "|VND";
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 không có trong JVM", e);
        }
    }
}
