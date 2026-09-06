package com.ecommerce.ordering.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Aggregate đơn hàng (SF-9). {@code address} + {@code timeline} jsonb
 * (Hibernate {@code @JdbcTypeCode(Sql.JSON)} như Reservation của inventory).
 * items = bảng {@code order_items} (pack pin bảng riêng) — cascade ALL vì
 * items chỉ sống trong aggregate.
 */
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Snapshot email từ JWT — order.confirmed fat payload cần, không tra identity. */
    @Column(nullable = false)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status = OrderStatus.PENDING;

    @Column(nullable = false)
    private long subtotal;

    @Column(nullable = false)
    private long discount;

    @Column(name = "shipping_fee", nullable = false)
    private long shippingFee;

    @Column(nullable = false)
    private long total;

    @Column(nullable = false, length = 8)
    private String currency = "VND";

    @Column(name = "coupon_code", length = 64)
    private String couponCode;

    @Column(name = "affiliate_code", length = 64)
    private String affiliateCode;

    @Column(name = "payment_method", nullable = false, length = 16)
    private String paymentMethod = "stripe";

    @Column(name = "shipping_method", nullable = false, length = 32)
    private String shippingMethod;

    @Column(name = "tracking_code", length = 64)
    private String trackingCode;

    @Column(name = "stripe_intent_id", length = 128)
    private String stripeIntentId;

    /** Replay cùng Idempotency-Key → cùng clientSecret (không tạo intent thứ 2). */
    @Column(name = "stripe_client_secret", length = 255)
    private String stripeClientSecret;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Address address;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<TimelineEntry> timeline = new ArrayList<>();

    @Column(name = "idempotency_key", nullable = false, length = 64)
    private String idempotencyKey;

    /** SHA-256 body — replay trùng key khác payload → 409 (contract). */
    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    /** D18 — số HĐ cấp 1 lần khi in đầu tiên; NULL = chưa có hóa đơn. */
    @Column(name = "invoice_number")
    private Long invoiceNumber;

    @Column(name = "invoice_issued_at")
    private Instant invoiceIssuedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    /**
     * Optimistic lock — consumer event (payment.succeeded) race với TTL sweeper /
     * admin cancel cùng lúc: loser nhận ObjectOptimisticLockingFailure → consumer
     * skip (path thắng đã xử lý đúng), timeline jsonb không mất entry.
     */
    @Version
    private long version;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<OrderItem> items = new ArrayList<>();

    protected Order() {
    }

    public Order(UUID userId, String email, long subtotal, long discount, long shippingFee, long total,
                 String couponCode, String affiliateCode, String paymentMethod, String shippingMethod,
                 Address address, String idempotencyKey, String payloadHash) {
        this.userId = userId;
        this.email = email;
        this.subtotal = subtotal;
        this.discount = discount;
        this.shippingFee = shippingFee;
        this.total = total;
        this.couponCode = couponCode;
        this.affiliateCode = affiliateCode;
        this.paymentMethod = paymentMethod;
        this.shippingMethod = shippingMethod;
        this.address = address;
        this.idempotencyKey = idempotencyKey;
        this.payloadHash = payloadHash;
        this.timeline = new ArrayList<>();
        appendTimeline(OrderStatus.PENDING);
    }

    // ── Mutation có chủ đích (saga + admin) — KHÔNG setter tự do ───────────

    /** Đổi trạng thái QUA GUARD §3.6 + append timeline. Caller outbox event riêng. */
    public void transitionTo(OrderStatus target) {
        if (!status.canTransitionTo(target)) {
            throw new IllegalStateException("Transition không hợp lệ theo §3.6: " + status + " → " + target);
        }
        this.status = target;
        this.updatedAt = Instant.now();
        appendTimeline(target);
    }

    /**
     * Đổi trạng thái terminal từ PENDING khi guard chỉ cần "PENDING & chưa PAID"
     * (race: payment.succeeded tới đồng thời TTL cancel) — dùng rowcount-gated
     * UPDATE ở repo, KHÔNG qua method này. Method này chỉ cho path đã check.
     */
    public void attachIntent(String paymentIntentId, String clientSecret) {
        this.stripeIntentId = paymentIntentId;
        this.stripeClientSecret = clientSecret;
        this.updatedAt = Instant.now();
    }

    public void markShipped(String trackingCode) {
        this.trackingCode = trackingCode;
    }

    /** Gán số HĐ (D18) — chỉ 1 lần; lần gọi sau no-op (cùng đơn → cùng số). */
    public void attachInvoiceNumber(long number) {
        if (this.invoiceNumber == null) {
            this.invoiceNumber = number;
            this.invoiceIssuedAt = Instant.now();
            this.updatedAt = Instant.now();
        }
    }

    private void appendTimeline(OrderStatus status) {
        if (timeline == null) {
            timeline = new ArrayList<>();
        }
        timeline.add(new TimelineEntry(status, Instant.now()));
    }

    // ── Read ────────────────────────────────────────────────────────────────

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getEmail() {
        return email;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public long getSubtotal() {
        return subtotal;
    }

    public long getDiscount() {
        return discount;
    }

    public long getShippingFee() {
        return shippingFee;
    }

    public long getTotal() {
        return total;
    }

    public String getCurrency() {
        return currency;
    }

    public String getCouponCode() {
        return couponCode;
    }

    public String getAffiliateCode() {
        return affiliateCode;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public String getShippingMethod() {
        return shippingMethod;
    }

    public String getTrackingCode() {
        return trackingCode;
    }

    public String getStripeIntentId() {
        return stripeIntentId;
    }

    public String getStripeClientSecret() {
        return stripeClientSecret;
    }

    public Address getAddress() {
        return address;
    }

    /** Timeline sắp theo thời gian (contract: "thu tu thoi gian"). */
    public List<TimelineEntry> getTimeline() {
        return timeline.stream().sorted(Comparator.comparing(TimelineEntry::at)).toList();
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getPayloadHash() {
        return payloadHash;
    }

    public Long getInvoiceNumber() {
        return invoiceNumber;
    }

    public Instant getInvoiceIssuedAt() {
        return invoiceIssuedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<OrderItem> getItems() {
        return items;
    }

    /** Thêm dòng hàng — set back-reference (FK do con sở hữu, {@code mappedBy}). */
    public void addItem(OrderItem item) {
        item.setOrder(this);
        this.items.add(item);
    }

    public void setItems(List<OrderItem> items) {
        this.items = new ArrayList<>();
        items.forEach(this::addItem);
    }
}
