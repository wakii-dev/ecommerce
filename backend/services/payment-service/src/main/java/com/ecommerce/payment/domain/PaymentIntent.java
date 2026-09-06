package com.ecommerce.payment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * Payment intent (pack SF-5): 1 row mỗi lần tạo intent (idempotency_key unique).
 * {@code stripeStatus} mirror Stripe trả về (response contract) — replay không
 * gọi lại adapter. Adapter lỗi giữa chừng → tx rollback, KHÔNG giữ row CREATED
 * (replay không bao giờ gặp row thiếu pi_ — spec §5.3 bước 4).
 */
@Entity
@Table(name = "payment_intents")
public class PaymentIntent {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "order_id", nullable = false, length = 64)
    private String orderId;

    @Column(name = "stripe_intent_id", unique = true, length = 128)
    private String stripeIntentId;

    @Column(name = "amount_vnd", nullable = false)
    private long amountVnd;

    @Column(nullable = false, length = 8)
    private String currency;        // 'VND' uppercase thống nhất

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private PaymentIntentStatus status;

    @Column(name = "idempotency_key", nullable = false, unique = true, length = 128)
    private String idempotencyKey;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(name = "client_secret", length = 255)
    private String clientSecret;

    @Column(name = "stripe_status", length = 32)
    private String stripeStatus;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected PaymentIntent() {
    }

    public PaymentIntent(String orderId, long amountVnd, String currency, String idempotencyKey, String payloadHash) {
        this.orderId = orderId;
        this.amountVnd = amountVnd;
        this.currency = currency;
        this.status = PaymentIntentStatus.CREATED;
        this.idempotencyKey = idempotencyKey;
        this.payloadHash = payloadHash;
    }

    public void markCreated(com.ecommerce.payment.spi.AdapterIntent result) {
        this.stripeIntentId = result.providerIntentId();
        this.clientSecret = result.clientSecret();
        this.stripeStatus = result.status();
        this.status = PaymentIntentStatus.REQUIRES_CONFIRMATION; // có client_secret — chờ FE confirm
        this.updatedAt = Instant.now();
    }

    public void markStatus(PaymentIntentStatus status) {
        this.status = status;
        this.updatedAt = Instant.now();
    }

    public void markStripeStatus(String stripeStatus) {
        this.stripeStatus = stripeStatus;
        this.updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getOrderId() {
        return orderId;
    }

    public String getStripeIntentId() {
        return stripeIntentId;
    }

    public long getAmountVnd() {
        return amountVnd;
    }

    public String getCurrency() {
        return currency;
    }

    public PaymentIntentStatus getStatus() {
        return status;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getPayloadHash() {
        return payloadHash;
    }

    public String getClientSecret() {
        return clientSecret;
    }

    public String getStripeStatus() {
        return stripeStatus;
    }
}
