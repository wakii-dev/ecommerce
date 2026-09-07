package com.ecommerce.ordering.saga;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.ordering.api.CouponInvalidException;
import com.ecommerce.ordering.api.ExternalUnavailableException;
import com.ecommerce.ordering.api.IdempotencyConflictException;
import com.ecommerce.ordering.api.InsufficientStockException;
import com.ecommerce.ordering.api.PointsInvalidException;
import com.ecommerce.ordering.api.UnsupportedFeatureException;
import com.ecommerce.ordering.api.dto.CreateOrderRequest;
import com.ecommerce.ordering.api.dto.CreateOrderResponse;
import com.ecommerce.ordering.api.dto.OrderMapper;
import com.ecommerce.ordering.domain.Address;
import com.ecommerce.ordering.domain.Coupon;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderItem;
import com.ecommerce.ordering.domain.OrderStatus;
import com.ecommerce.ordering.domain.SagaState;
import com.ecommerce.ordering.domain.SagaStep;
import com.ecommerce.ordering.repo.CouponRepository;
import com.ecommerce.ordering.repo.OrderRepository;
import com.ecommerce.ordering.repo.SagaStateRepository;
import com.ecommerce.ordering.saga.PricingAuthority.PricedItem;
import com.ecommerce.ordering.service.CouponService;
import com.ecommerce.ordering.service.ShippingMethodsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Checkout saga ORCHESTRATOR (§3.3 — artifact phức tạp nhất epic).
 *
 * <pre>
 * POST /orders (Idempotency-Key):
 *   replay check → re-price catalog (authority §6.1.1)
 *   → Tx A: ORDER_PENDING + items + saga_state + outbox order.created
 *   → Tx B: reserve coupon NGUYÊN TỬ (guard UPDATE used_count &lt; limit)
 *   → REST: reserve inventory all-or-nothing (TTL 30')
 *   → REST: create payment intent (Idempotency-Key)
 *   → Tx D: attach intent → trả {order, clientSecret}
 *
 * fail BẤT KỲ (sau Tx A) → compensation (§3.3): release coupon
 *   + [order.failed event → inventory tự release reservation]
 *   + ORDER_FAILED (guard §3.6 PENDING→FAILED, system)
 * </pre>
 *
 * <p>Tx NGẮN, REST NGOÀI tx: mỗi mutation DB 1 tx riêng (reprice/inventory/
 * payment là HTTP — KHÔNG bọc tx). Crash giữa chừng → order PENDING treo →
 * TTL sweeper (35') + inventory TTL (30') dọn — tự chữa, không kẹt tiền.</p>
 */
@Service
public class CheckoutSaga {

    private static final Logger log = LoggerFactory.getLogger(CheckoutSaga.class);

    /**
     * 1 điểm quy đổi 100đ — MIRROR {@code affiliate.loyalty.point-vnd}
     * (quyết định spec D3/D4: ordering cap effectivePoints trước khi redeem
     * để không đốt điểm vượt số tiền được giảm).
     */
    static final long POINT_VND = 100;

    private final OrderRepository orders;
    private final CouponRepository coupons;
    private final SagaStateRepository sagaStates;
    private final CouponService couponService;
    private final PricingAuthority pricing;
    private final InventoryClient inventory;
    private final PaymentClient payment;
    private final com.ecommerce.ordering.service.OrderLifecycleService lifecycle;
    private final LoyaltyClient loyalty;
    private final ShippingMethodsService shippingMethods;
    private final OutboxWriter outbox;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public CheckoutSaga(
        OrderRepository orders,
        CouponRepository coupons,
        SagaStateRepository sagaStates,
        CouponService couponService,
        PricingAuthority pricing,
        InventoryClient inventory,
        PaymentClient payment,
        com.ecommerce.ordering.service.OrderLifecycleService lifecycle,
        LoyaltyClient loyalty,
        ShippingMethodsService shippingMethods,
        OutboxWriter outbox,
        ObjectMapper objectMapper,
        TransactionTemplate tx
    ) {
        this.orders = orders;
        this.coupons = coupons;
        this.sagaStates = sagaStates;
        this.couponService = couponService;
        this.pricing = pricing;
        this.inventory = inventory;
        this.payment = payment;
        this.lifecycle = lifecycle;
        this.loyalty = loyalty;
        this.shippingMethods = shippingMethods;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
        this.tx = tx;
    }

    public CreateOrderResponse createOrder(UUID userId, String email, CreateOrderRequest request,
                                           String idempotencyKey, String correlationId) {
        // (0) Validate những gì bean-validation không che được
        // SF-14: fee authority lúc đặt — GHN method tính phí theo địa chỉ thật
        // (degraded → flat giữ nguyên shape). totalQty để tính weight GHN.
        int totalQty = request.items().stream().mapToInt(CreateOrderRequest.Item::qty).sum();
        ShippingMethodsService.Method shipping = shippingMethods.resolve(
            request.shippingMethod(), request.address().city(), request.address().district(), totalQty);
        // COD (SF-13 A2/D21): bỏ guard chặn — saga SKIP bước payment intent,
        // sau reserve → CONFIRMED luôn (state machine path PENDING→CONFIRMED).
        boolean cod = "cod".equalsIgnoreCase(request.paymentMethod() == null ? "stripe" : request.paymentMethod());
        // D22 (SF-14): usePoints xử lý sau Tx A (redeem cần orderId, bước 5b)

        // (1) Replay Idempotency-Key (contract: trùng key + khác payload → 409)
        String payloadHash = sha256(request);
        Order existing = orders.findByUserIdAndIdempotencyKey(userId, idempotencyKey).orElse(null);
        if (existing != null) {
            if (!existing.getPayloadHash().equals(payloadHash)) {
                throw new IdempotencyConflictException("Idempotency-Key đã dùng cho payload khác");
            }
            log.info("Replay Idempotency-Key {} → đơn cũ {} ({})", idempotencyKey, existing.getId(), existing.getStatus());
            return new CreateOrderResponse(OrderMapper.toDto(existing), existing.getStripeClientSecret());
        }

        // (2) Re-price server-side — catalog là authority (§6.1.1); gom trùng
        // (productId, variantId) giữ long chống overflow như inventory.
        record LineKey(UUID productId, UUID variantId) {
        }
        Map<LineKey, Long> merged = new LinkedHashMap<>();
        for (CreateOrderRequest.Item item : request.items()) {
            merged.merge(new LineKey(item.productId(), item.variantId()), (long) item.qty(), Long::sum);
        }
        List<PricingAuthority.PricedItem> priced = new ArrayList<>();
        merged.forEach((key, qty) -> {
            PricedItem p = pricing.price(key.productId(), key.variantId());
            priced.add(new PricingAuthority.PricedItem(p.productId(), p.variantId(), p.name(), p.unitPrice()));
        });
        long subtotal = priced.stream().mapToLong(p -> p.unitPrice() * merged.get(
            new LineKey(p.productId(), p.variantId()))).sum();

        // (3) Validate coupon + tính giảm (chưa reserve — reserve ở Tx B, nguyên tử)
        Coupon coupon = null;
        long discount = 0;
        if (request.couponCode() != null && !request.couponCode().isBlank()) {
            String code = request.couponCode().trim();
            coupon = coupons.findByCode(code)
                .orElseThrow(() -> new CouponInvalidException("Mã giảm giá không tồn tại"));
            if (!coupon.isRunning(Instant.now())) {
                throw new CouponInvalidException("Mã giảm giá không còn hiệu lực");
            }
            if (!coupon.meetsMinOrder(subtotal)) {
                throw new CouponInvalidException("Đơn tối thiểu " + coupon.getMinOrderValue() + "đ để dùng mã này");
            }
            discount = coupon.discountFor(subtotal);
        }
        // D4 (review P1): validate ĐIỂM TRƯỚC Tx A — hàng thấp hơn 100đ/sau coupon
        // mà vẫn muốn dùng điểm → 422 ngay, KHÔNG để lại order PENDING mồ côi
        // (throw sau Tx A phải kèm failOrder, ở đây chưa tạo gì nên throw sạch).
        if (request.usePoints() != null && request.usePoints() > 0
            && (subtotal - discount) / POINT_VND <= 0) {
            throw new PointsInvalidException(
                "Đơn hàng không đủ giá trị để dùng điểm (tối thiểu " + POINT_VND + "đ sau giảm giá)");
        }
        long total = subtotal - discount + shipping.fee();
        // Snapshot final cho lambda (coupon/discount gán trong block validate ở trên)
        final Coupon couponFinal = coupon;
        final long discountFinal = discount;

        // (4) Tx A — ORDER_PENDING + items + saga_state + outbox order.created
        Order order = tx.execute(status -> {
            Order o = new Order(userId, email, subtotal, discountFinal, shipping.fee(), total,
                couponFinal == null ? null : couponFinal.getCode(), request.affiliateCode(),
                request.paymentMethod() == null ? "stripe" : request.paymentMethod(),
                request.shippingMethod(), toDomainAddress(request.address()), idempotencyKey, payloadHash);
            merged.forEach((key, qty) -> {
                PricingAuthority.PricedItem p = pricingCache(priced, key.productId(), key.variantId());
                o.addItem(new OrderItem(key.productId(), key.variantId(), p.name(), p.unitPrice(), qty.intValue()));
            });
            orders.save(o);
            sagaStates.save(new SagaState(o.getId(), SagaStep.RE_PRICE, correlationId));
            ObjectNode createdPayload = objectMapper.createObjectNode()
                .put("orderId", o.getId().toString())
                .put("userId", o.getUserId().toString())
                .put("status", o.getStatus().name())
                .put("total", o.getTotal())
                .put("createdAt", o.getCreatedAt().toString());
            outbox.write("order.created", createdPayload, correlationId);
            return o;
        });
        log.info("Order {} PENDING (user={}, subtotal={}, discount={}, total={})",
            order.getId(), userId, subtotal, discount, total);

        // (5) Tx B — reserve coupon NGUYÊN TỬ (§6.1.3); fail → compensation + 422
        if (couponFinal != null) {
            try {
                tx.executeWithoutResult(status -> {
                    couponService.reserve(order.getId(), couponFinal.getCode(), subtotal);
                    advanceSaga(order.getId(), SagaStep.COUPON_RESERVED, correlationId);
                });
            } catch (CouponInvalidException e) {
                failOrder(order.getId(), "coupon_reserve_failed", "RESERVE", correlationId);
                throw e;
            }
        }

        // (5b) D22 — redeem điểm loyalty (REST ngoài tx, cần orderId từ Tx A;
        // affiliate lo nguyên tử + ledger UNIQUE order). fail → compensation:
        // order.failed → loyalty consumer hoàn điểm (quyết định spec D5).
        // effectivePoints cap ≤ (subtotal - coupon)/POINT_VND — không đốt điểm
        // vượt số tiền được giảm (quyết định spec D4).
        long pointsDiscount = 0;
        long finalTotal = total;
        if (request.usePoints() != null && request.usePoints() > 0) {
            long effective = Math.min(request.usePoints(),
                Math.max(0, (subtotal - discountFinal) / POINT_VND));
            if (effective <= 0) {
                // Defense-in-depth (đã chặn trước Tx A) — nếu lọt đây PHẢI compensation
                failOrder(order.getId(), "loyalty_invalid", "RESERVE", correlationId);
                throw new PointsInvalidException("Đơn hàng không đủ giá trị để dùng điểm");
            }
            try {
                pointsDiscount = loyalty.redeem(userId, effective, order.getId().toString()).discount();
            } catch (PointsInvalidException e) {
                failOrder(order.getId(), "loyalty_redeem_failed", "RESERVE", correlationId);
                throw e;
            } catch (Exception e) {
                log.error("Redeem điểm fail cho order {} — compensation", order.getId(), e);
                failOrder(order.getId(), "loyalty_unavailable", "OTHER", correlationId);
                throw new ExternalUnavailableException("Điểm thưởng tạm bận — đơn đã hủy, thử lại sau");
            }
            if (pointsDiscount > 0) {
                finalTotal = subtotal - discountFinal - pointsDiscount + shipping.fee();
                final long appliedDiscount = pointsDiscount;
                final long appliedTotal = finalTotal;
                tx.executeWithoutResult(status -> orders.findById(order.getId())
                    .ifPresent(o -> o.applyPointsDiscount(appliedDiscount, appliedTotal)));
            }
            log.info("Order {} dùng {} điểm → giảm {}đ (total {})", order.getId(), effective,
                pointsDiscount, finalTotal);
        }

        // (6) REST reserve inventory all-or-nothing (NGOÀI tx); fail → compensation
        List<InventoryClient.ReserveItem> reserveItems = priced.stream()
            .map(p -> new InventoryClient.ReserveItem(p.variantId(),
                merged.get(new LineKey(p.productId(), p.variantId())).intValue()))
            .toList();
        try {
            inventory.reserve(order.getId(), reserveItems);
            advanceSaga(order.getId(), SagaStep.INVENTORY_RESERVED, correlationId);
        } catch (InsufficientStockException e) {
            failOrder(order.getId(), "insufficient_stock", "RESERVE", correlationId);
            throw e;
        } catch (Exception e) {
            log.error("Reserve inventory fail cho order {} — compensation", order.getId(), e);
            failOrder(order.getId(), "inventory_unavailable", "OTHER", correlationId);
            throw new ExternalUnavailableException("Hệ thống kho tạm bận — đơn đã hủy, thử lại sau");
        }

        // (7-COD) sau reserve → CONFIRMED LUÔN (1 tx: transition + finalize coupon
        // + outbox order.confirmed fat payload) — KHÔNG gọi payment, KHÔNG chờ
        // webhook; tiền thu lúc giao qua capture (deliver, lifecycle.deliverCod).
        if (cod) {
            Order confirmed = lifecycle.confirmCodOrder(order.getId(), correlationId);
            advanceSaga(order.getId(), SagaStep.DONE, correlationId);
            log.info("Order {} COD — CONFIRMED sau reserve, bỏ bước intent (SF-13)", order.getId());
            return new CreateOrderResponse(OrderMapper.toDto(confirmed), null);
        }

        // (7) REST create payment intent (NGOÀI tx; Idempotency-Key truyền tiếp) —
        // amount = finalTotal (đã trừ pointsDiscount, D22)
        PaymentClient.IntentCreated intent;
        try {
            intent = payment.createIntent(order.getId(), finalTotal, idempotencyKey);
        } catch (Exception e) {
            // order.failed → inventory release reservation; coupon release tại đây
            log.error("Create payment intent fail cho order {} — compensation", order.getId(), e);
            failOrder(order.getId(), "payment_intent_failed", "PAYMENT", correlationId);
            throw new ExternalUnavailableException("Thanh toán tạm bận — đơn đã hủy, thử lại sau");
        }

        // (8) Tx D — attach intent + DONE
        Order saved = tx.execute(status -> {
            Order o = orders.findById(order.getId()).orElseThrow();
            o.attachIntent(intent.paymentIntentId(), intent.clientSecret());
            SagaState saga = sagaStates.findById(order.getId()).orElse(null);
            if (saga != null) {
                saga.advance(SagaStep.DONE);
            }
            return orders.save(o);
        });
        log.info("Order {} saga DONE — intent {} chờ confirm", order.getId(), intent.paymentIntentId());
        return new CreateOrderResponse(OrderMapper.toDto(saved), intent.clientSecret());
    }

    /**
     * Compensation (§3.3) — MỘT tx cho: release coupon (guarded) + PENDING→FAILED
     * (guard + optimistic lock: race với payment.succeeded thì path thắng xử
     * trước, path này skip an toàn) + outbox order.failed (→ inventory release).
     */
    public void failOrder(UUID orderId, String reason, String stage, String correlationId) {
        Boolean failed = tx.execute(status -> {
            Order o = orders.findById(orderId).orElse(null);
            if (o == null) {
                return false;
            }
            // Release coupon SAU guard PENDING (review SF-9 P1): decline/timeout
            // đến trễ khi đơn đã PAID/CONFIRMED → KHÔNG được trả lại lượt dùng
            // coupon của đơn vẫn giữ giảm giá.
            if (o.getStatus() == OrderStatus.PENDING) {
                couponService.releaseForOrder(orderId);
                o.transitionTo(OrderStatus.FAILED);
                orders.save(o);
                ObjectNode payload = objectMapper.createObjectNode()
                    .put("orderId", orderId.toString())
                    .put("reason", reason)
                    .put("stage", stage);
                outbox.write("order.failed", payload, correlationId);
                log.info("Order {} FAILED (reason={}, stage={}) — coupon released, reservation sẽ release qua event",
                    orderId, reason, stage);
                return true;
            }
            log.warn("failOrder cho order {} ở trạng thái {} — bỏ qua (không phải PENDING)", orderId, o.getStatus());
            return false;
        });
        if (failed != null && !failed) {
            log.debug("failOrder: không chuyển FAILED được cho {} — trạng thái đã đổi (path khác thắng race)", orderId);
        }
    }

    private void advanceSaga(UUID orderId, SagaStep step, String correlationId) {
        tx.executeWithoutResult(status -> {
            SagaState saga = sagaStates.findById(orderId).orElse(null);
            if (saga != null) {
                saga.advance(step);
            }
        });
    }

    private PricingAuthority.PricedItem pricingCache(List<PricingAuthority.PricedItem> priced,
                                                     UUID productId, UUID variantId) {
        return priced.stream()
            .filter(p -> p.productId().equals(productId) && p.variantId().equals(variantId))
            .findFirst()
            .orElseThrow();
    }

    private Address toDomainAddress(com.ecommerce.ordering.api.dto.AddressDto dto) {
        return new Address(dto.fullName(), dto.phone(), dto.line1(), dto.ward(), dto.district(),
            dto.city(), dto.postalCode());
    }

    /** SHA-256 body JSON — replay trùng key khác payload → 409 (contract). */
    private String sha256(CreateOrderRequest request) {
        try {
            JsonNode tree = objectMapper.valueToTree(request);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(tree.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 không có trong JVM", e);
        }
    }
}
