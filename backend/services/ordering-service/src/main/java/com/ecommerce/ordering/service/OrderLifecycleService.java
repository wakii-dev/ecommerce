package com.ecommerce.ordering.service;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.ordering.api.InvalidStateTransitionException;
import com.ecommerce.ordering.api.PaymentUnavailableException;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderStatus;
import com.ecommerce.ordering.repo.OrderRepository;
import com.ecommerce.ordering.saga.PaymentClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.UUID;

/**
 * Mọi transition §3.6 đi qua ĐÂY — MỘT tx cho marker(consumer)/transition/
 * coupon/outbox (pattern InventoryOrderConsumer). Caller phải load order ở
 * trạng thái hợp lệ; guard {@code canTransitionTo} chặn path trái luật.
 *
 * <p>Outbox payloads khớp schemas frozen trong {@code contracts/events/}
 * (order.paid / order.confirmed / order.cancelled / order.failed).</p>
 */
@Service
public class OrderLifecycleService {

    private static final Logger log = LoggerFactory.getLogger(OrderLifecycleService.class);

    private final OrderRepository orders;
    private final CouponService couponService;
    private final OutboxWriter outbox;
    private final PaymentClient payment;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public OrderLifecycleService(
        OrderRepository orders,
        CouponService couponService,
        OutboxWriter outbox,
        PaymentClient payment,
        ObjectMapper objectMapper,
        TransactionTemplate tx
    ) {
        this.orders = orders;
        this.couponService = couponService;
        this.outbox = outbox;
        this.payment = payment;
        this.objectMapper = objectMapper;
        this.tx = tx;
    }

    /**
     * payment.succeeded → PAID + outbox order.paid. Chỉ từ PENDING; terminal
     * CANCELLED/FAILED → late payment: REFUND (pack §3.3) + log — status giữ
     * nguyên; đã PAID+ → no-op (redelivery/kỳ lạ).
     */
    public void onPaymentSucceeded(String orderId, String paymentIntentId, String correlationId) {
        tx.executeWithoutResult(status -> {
            Order o = orders.findById(UUID.fromString(orderId)).orElse(null);
            if (o == null) {
                log.warn("payment.succeeded cho order lạ {} — bỏ qua", orderId);
                return;
            }
            switch (o.getStatus()) {
                case PENDING -> {
                    o.transitionTo(OrderStatus.PAID);
                    orders.save(o);
                    ObjectNode payload = objectMapper.createObjectNode()
                        .put("orderId", orderId)
                        .put("paymentIntentId", paymentIntentId)
                        .put("paidAt", Instant.now().toString());
                    outbox.write("order.paid", payload, correlationId);
                    log.info("Order {} PAID (intent {})", orderId, paymentIntentId);
                }
                case CANCELLED, FAILED -> {
                    // LATE PAYMENT (§3.3): user quên tab Stripe, tiền vẫn vào sau TTL.
                    // Refund full + log (email là việc notification SF-10 qua event —
                    // không có event phù hợp trong freeze, chỉ log + refund).
                    log.warn("LATE PAYMENT: order {} đã {} nhưng payment.succeeded tới → refund",
                        orderId, o.getStatus());
                    refundSafely(paymentIntentId, orderId, "late_payment_after_" + o.getStatus().name().toLowerCase());
                }
                default -> log.warn("payment.succeeded cho order {} đang {} — no-op (đã xử lý?)", orderId, o.getStatus());
            }
        });
    }

    /**
     * payment.failed (webhook declined) → PENDING→FAILED + release coupon +
     * outbox order.failed (stage PAYMENT) → inventory release qua event đó.
     */
    public void onPaymentFailed(String orderId, String failureReason, String correlationId) {
        tx.executeWithoutResult(status -> {
            Order o = orders.findById(UUID.fromString(orderId)).orElse(null);
            if (o == null) {
                log.warn("payment.failed cho order lạ {} — bỏ qua", orderId);
                return;
            }
            if (o.getStatus() != OrderStatus.PENDING) {
                log.warn("payment.failed cho order {} đang {} — no-op", orderId, o.getStatus());
                return;
            }
            couponService.releaseForOrder(o.getId());
            o.transitionTo(OrderStatus.FAILED);
            orders.save(o);
            ObjectNode payload = objectMapper.createObjectNode()
                .put("orderId", orderId)
                .put("reason", failureReason == null ? "card_declined" : failureReason)
                .put("stage", "PAYMENT");
            outbox.write("order.failed", payload, correlationId);
            log.info("Order {} FAILED (payment declined: {}) — coupon released", orderId, failureReason);
        });
    }

    /**
     * inventory.committed → PAID→CONFIRMED + finalize coupon + outbox
     * order.confirmed FAT PAYLOAD (§6.1.5 — đủ cho MỌI consumer không call-back).
     */
    public void onInventoryCommitted(String orderId, String correlationId) {
        tx.executeWithoutResult(status -> {
            Order o = orders.findById(UUID.fromString(orderId)).orElse(null);
            if (o == null) {
                log.warn("inventory.committed cho order lạ {} — bỏ qua", orderId);
                return;
            }
            if (o.getStatus() != OrderStatus.PAID) {
                log.warn("inventory.committed cho order {} đang {} — no-op (chỉ PAID→CONFIRMED)", orderId, o.getStatus());
                return;
            }
            o.transitionTo(OrderStatus.CONFIRMED);
            orders.save(o);
            if (o.getCouponCode() != null) {
                couponService.finalizeForOrder(o.getId());
            }
            ObjectNode payload = buildConfirmedPayload(o);
            outbox.write("order.confirmed", payload, correlationId);
            log.info("Order {} CONFIRMED — order.confirmed fat payload published", orderId);
        });
    }

    /**
     * inventory.released (reservation TTL hết) khi order còn PENDING →
     * CANCELLED (system) + release coupon + outbox order.cancelled. Order
     * không PENDING (release do order.failed/cancelled của chính mình) → no-op.
     */
    public void onInventoryReleased(String orderId, String correlationId) {
        tx.executeWithoutResult(status -> {
            Order o = orders.findById(UUID.fromString(orderId)).orElse(null);
            if (o == null) {
                log.warn("inventory.released cho order lạ {} — bỏ qua", orderId);
                return;
            }
            if (o.getStatus() != OrderStatus.PENDING) {
                log.debug("inventory.released cho order {} đang {} — no-op", orderId, o.getStatus());
                return;
            }
            couponService.releaseForOrder(o.getId());
            o.transitionTo(OrderStatus.CANCELLED);
            orders.save(o);
            outbox.write("order.cancelled", cancelledPayload(o, "ttl_expired", "system", null), correlationId);
            log.info("Order {} CANCELLED (reservation TTL hết trước khi trả tiền)", orderId);
        });
    }

    /** TTL safety net (pack: PENDING quá 35' sau TTL inventory 30') — sweeper gọi. */
    public void cancelExpiredPending(Order o) {
        tx.executeWithoutResult(status -> {
            Order fresh = orders.findById(o.getId()).orElse(null);
            if (fresh == null || fresh.getStatus() != OrderStatus.PENDING) {
                return;
            }
            couponService.releaseForOrder(fresh.getId());
            fresh.transitionTo(OrderStatus.CANCELLED);
            orders.save(fresh);
            outbox.write("order.cancelled", cancelledPayload(fresh, "ttl_expired", "system", null), "system:ttl-sweeper");
            log.info("Order {} CANCELLED bởi TTL sweeper (35')", fresh.getId());
        });
    }

    /**
     * User tự hủy — chỉ PENDING (contract cancelMyOrder). Của người khác → 404
     * (repo theo user_id). Trả order đã CANCELLED.
     */
    public Order cancelByUser(UUID orderId, UUID userId) {
        return tx.execute(status -> {
            Order o = orders.findByIdAndUserId(orderId, userId)
                .orElseThrow(() -> new InvalidStateTransitionException("Không tìm thấy đơn"));
            if (o.getStatus() != OrderStatus.PENDING) {
                throw new InvalidStateTransitionException(
                    "Chỉ đơn PENDING mới hủy được — đơn đang " + o.getStatus());
            }
            couponService.releaseForOrder(o.getId());
            o.transitionTo(OrderStatus.CANCELLED);
            orders.save(o);
            outbox.write("order.cancelled", cancelledPayload(o, "user_cancelled", "user", null),
                "user:" + userId);
            return o;
        });
    }

    /**
     * Admin cancel (§3.6): PENDING → CANCELLED; PAID/CONFIRMED → CANCELLED +
     * REFUND; SHIPPED/DELIVERED → 409.
     *
     * <p>Thứ tự chống-race (review SF-9 P1): (1) TX chiếm CANCELLED — re-check
     * trạng thái trong tx + {@code @Version} optimistic: consumer confirm/ship
     * thắng race → save ném lock exception → KHÔNG refund đơn vẫn tiếp tục
     * chạy; (2) refund NGOÀI tx SAU khi đơn đã CANCELLED (idempotent theo key
     * deterministic {@code admin-cancel:<orderId>} — retry không double-refund);
     * (3) outbox order.cancelled sau cùng — refunded đã biết chắc. Refund lỗi
     * → vẫn publish order.cancelled (refunded=false, release reservation) rồi
     * rethrow 502; lượt retry sau đi vào nhánh CANCELLED + timeline-PAID
     * (guard bên dưới) → resume refund cùng key idempotent.</p>
     */
    public Order cancelByAdmin(UUID orderId) {
        // Pre-read CHỈ để 409 sớm + quyết định paidLike — TX bên dưới mới là
        // authority (refund chỉ chạy nếu TX1 xác nhận trạng thái chưa đổi).
        Order o = orders.findById(orderId)
            .orElseThrow(() -> new InvalidStateTransitionException("Không tìm thấy đơn"));
        OrderStatus from = o.getStatus();
        if (from == OrderStatus.SHIPPED || from == OrderStatus.DELIVERED
            || from == OrderStatus.FAILED) {
            throw new InvalidStateTransitionException("Không hủy được đơn đang " + from);
        }
        if (from == OrderStatus.CANCELLED) {
            // Re-review P1: refund lượt cancel trước có thể LỖI → đơn đã
            // CANCELLED mà tiền chưa hoàn; retry phải TIẾP TỤC refund (cùng key
            // idempotent — payment 409 = đã hoàn rồi) thay vì 409 chặn làm tiền
            // kẹt. Chỉ với đơn TỪNG PAID (timeline) + có intent; CANCELLED từ
            // PENDING (user tự hủy/TTL — chưa trả tiền) → 409 như cũ.
            boolean wasPaid = o.getTimeline().stream()
                .anyMatch(t -> t.status() == OrderStatus.PAID);
            if (wasPaid && o.getStripeIntentId() != null) {
                refundOrThrow(o.getStripeIntentId(), orderId, "admin_cancel_after_paid");
                return orders.findById(orderId).orElseThrow();
            }
            throw new InvalidStateTransitionException("Không hủy được đơn đang " + from);
        }
        boolean paidLike = from.paidLike() && o.getStripeIntentId() != null;

        // TX 1: chiếm CANCELLED (guarded + optimistic lock) + release coupon.
        tx.executeWithoutResult(status -> {
            Order fresh = orders.findById(orderId).orElseThrow();
            if (fresh.getStatus() != from) {
                throw new InvalidStateTransitionException(
                    "Đơn vừa đổi trạng thái (" + fresh.getStatus() + ") — thử lại");
            }
            couponService.releaseForOrder(orderId);
            fresh.transitionTo(OrderStatus.CANCELLED);
            orders.save(fresh);
        });

        // Refund NGOÀI tx — chỉ với đơn đã CANCELLED thật sự.
        boolean refunded;
        try {
            if (paidLike) {
                refundOrThrow(o.getStripeIntentId(), orderId, "admin_cancel_after_paid");
                refunded = true;
            } else {
                refunded = false;
            }
        } catch (RuntimeException e) {
            writeCancelledOutbox(orderId, false);
            throw e;
        }
        writeCancelledOutbox(orderId, refunded);
        return orders.findById(orderId).orElseThrow();
    }

    /** Outbox order.cancelled (admin) — tx riêng vì refund là REST ngoài tx. */
    private void writeCancelledOutbox(UUID orderId, boolean refunded) {
        tx.executeWithoutResult(status -> outbox.write("order.cancelled",
            cancelledPayload(orders.findById(orderId).orElseThrow(),
                "admin_cancelled", "admin", refunded ? Boolean.TRUE : null),
            "admin:" + orderId));
    }

    private void refundOrThrow(String paymentIntentId, UUID orderId, String reason) {
        try {
            payment.refund(paymentIntentId, reason, deterministicKey("admin-cancel:" + orderId));
        } catch (org.springframework.web.client.HttpClientErrorException.Conflict e) {
            // 409 = đã refund rồi (retry sau crash) — coi như thành công
            log.info("Refund order {} đã tồn tại trên payment — tiếp tục cancel", orderId);
        } catch (org.springframework.web.client.RestClientException e) {
            // Lỗi payment khác (5xx/timeout/4xx) → 502 RÕ qua handler — không
            // 500 raw; retry admin-cancel sau đó resume refund bằng cùng key.
            throw new PaymentUnavailableException(
                "Refund thất bại cho đơn " + orderId + ": " + e.getMessage());
        }
    }

    private void refundSafely(String paymentIntentId, String orderId, String reason) {
        try {
            payment.refund(paymentIntentId, reason, deterministicKey("late:" + orderId));
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            // 4xx từ payment (đã refund / không refund được) — log, không requeue poison
            log.warn("Refund late payment order {} bị từ chối: {}", orderId, e.getMessage());
        } catch (Exception e) {
            // hạ tầng lỗi — rethrow để Rabbit requeue, marker rollback → retry sau
            throw new PaymentUnavailableException("Refund late payment lỗi hạ tầng: " + e.getMessage());
        }
    }

    /** UUID deterministic — cùng (purpose, orderId) → cùng key (payment dedupe retry). */
    private UUID deterministicKey(String input) {
        return UUID.nameUUIDFromBytes(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private ObjectNode cancelledPayload(Order o, String reason, String cancelledBy, Boolean refunded) {
        ObjectNode payload = objectMapper.createObjectNode()
            .put("orderId", o.getId().toString())
            .put("reason", reason)
            .put("cancelledBy", cancelledBy);
        if (refunded != null) {
            payload.put("refunded", refunded);
        }
        return payload;
    }

    /** FAT PAYLOAD §6.1.5 — schema-exact order.confirmed.schema.json. */
    private ObjectNode buildConfirmedPayload(Order o) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("orderId", o.getId().toString());
        payload.put("userId", o.getUserId().toString());
        payload.put("email", o.getEmail());
        ArrayNode items = payload.putArray("items");
        o.getItems().forEach(i -> {
            ObjectNode item = items.addObject();
            item.put("productId", i.getProductId().toString());
            item.put("variantId", i.getVariantId().toString());
            item.put("qty", i.getQty());
            item.put("price", i.getUnitPrice());
            item.put("name", i.getName());
        });
        payload.put("subtotal", o.getSubtotal());
        payload.put("discount", o.getDiscount());
        payload.put("shippingFee", o.getShippingFee());
        payload.put("total", o.getTotal());
        payload.put("currency", o.getCurrency());
        if (o.getCouponCode() != null) {
            payload.put("couponCode", o.getCouponCode());
        }
        payload.put("affiliateCode", o.getAffiliateCode()); // nullable — schema ["string","null"]
        payload.put("confirmedAt", Instant.now().toString());
        return payload;
    }
}
