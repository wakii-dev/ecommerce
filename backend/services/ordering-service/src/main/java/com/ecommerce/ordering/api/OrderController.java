package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.CouponDtos.ValidateCouponRequest;
import com.ecommerce.ordering.api.dto.CouponDtos.ValidateCouponResponse;
import com.ecommerce.ordering.api.dto.CreateOrderRequest;
import com.ecommerce.ordering.api.dto.CreateOrderResponse;
import com.ecommerce.ordering.api.dto.PageDtos.OrderSummaryPageDto;
import com.ecommerce.ordering.api.dto.OrderDto;
import com.ecommerce.ordering.api.dto.OrderSummaryDto;
import com.ecommerce.ordering.api.dto.TrackingDtos.TrackingResponseDto;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderStatus;
import com.ecommerce.ordering.repo.OrderRepository;
import com.ecommerce.ordering.saga.CheckoutSaga;
import com.ecommerce.ordering.service.CouponService;
import com.ecommerce.ordering.service.OrderLifecycleService;
import com.ecommerce.ordering.service.ShippingMethodsService;
import com.ecommerce.ordering.service.invoice.InvoiceProvider;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import org.slf4j.MDC;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Customer APIs (paths SAU StripPrefix=1 — contract public path là
 * /api/ordering/**): tạo đơn (saga), đơn của tôi, hủy, tải hóa đơn.
 */
@RestController
@RequestMapping
public class OrderController {

    private static final int MAX_PAGE_SIZE = 100;

    private final CheckoutSaga saga;
    private final OrderRepository orders;
    private final OrderLifecycleService lifecycle;
    private final CouponService couponService;
    private final InvoiceProvider invoiceProvider;
    private final ShippingMethodsService shipping;

    public OrderController(CheckoutSaga saga, OrderRepository orders, OrderLifecycleService lifecycle,
                           CouponService couponService, InvoiceProvider invoiceProvider,
                           ShippingMethodsService shipping) {
        this.saga = saga;
        this.orders = orders;
        this.lifecycle = lifecycle;
        this.couponService = couponService;
        this.invoiceProvider = invoiceProvider;
        this.shipping = shipping;
    }

    /**
     * POST /orders — BẮT BUỘC Idempotency-Key (contract; thiếu → 400).
     * Identity: sub = user id, email claim cho fat payload khi CONFIRMED.
     */
    @PostMapping("/orders")
    public ResponseEntity<CreateOrderResponse> createOrder(
        @AuthenticationPrincipal Jwt jwt,
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @Valid @RequestBody CreateOrderRequest request) {
        CreateOrderResponse response = saga.createOrder(
            UUID.fromString(jwt.getSubject()),
            jwt.getClaimAsString("email"),
            request, idempotencyKey, MDC.get("requestId"));
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /** POST /orders/validate-coupon — public (contract), realtime FE, không reserve. */
    @PostMapping("/orders/validate-coupon")
    public ValidateCouponResponse validateCoupon(@Valid @RequestBody ValidateCouponRequest request) {
        return couponService.validate(request.code(), request.subtotal());
    }

    /** GET /me/orders — đơn của tôi, mới nhất trước (contract). */
    @GetMapping("/me/orders")
    public OrderSummaryPageDto myOrders(
        @AuthenticationPrincipal Jwt jwt,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size) {
        UUID userId = UUID.fromString(jwt.getSubject());
        Page<OrderSummaryDto> result = orders
            .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(Math.max(0, page - 1), Math.min(size, MAX_PAGE_SIZE)))
            .map(OrderSummaryDto::from);
        return OrderSummaryPageDto.of(result);
    }

    /** GET /me/orders/{id} — CHỦ đơn only; của người khác → 404 (repo theo user). */
    @GetMapping("/me/orders/{id}")
    public OrderDto myOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Order order = orders.findByIdAndUserId(id, UUID.fromString(jwt.getSubject()))
            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn"));
        return OrderDto.from(order);
    }

    /** POST /me/orders/{id}/cancel — chỉ PENDING (§3.6); trái luật → 409. */
    @PostMapping("/me/orders/{id}/cancel")
    public OrderDto cancelMyOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Order cancelled = lifecycle.cancelByUser(id, UUID.fromString(jwt.getSubject()));
        return OrderDto.from(cancelled);
    }

    /**
     * GET /me/orders/{id}/invoice — PDF (D18). 409 khi chưa CONFIRMED+ (contract).
     * Chủ đơn only (repo theo user).
     */
    @GetMapping(value = "/me/orders/{id}/invoice", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> myOrderInvoice(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Order order = orders.findByIdAndUserId(id, UUID.fromString(jwt.getSubject()))
            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn"));
        if (!order.getStatus().invoiceAvailable()) {
            throw new InvalidStateTransitionException(
                "Đơn chưa CONFIRMED — chưa có hóa đơn (đang " + order.getStatus() + ")");
        }
        byte[] pdf = invoiceProvider.generate(order);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header("Content-Disposition", "inline; filename=\"invoice-" + order.getInvoiceNumber() + ".pdf\"")
            .body(pdf);
    }

    /**
     * GET /me/orders/{id}/tracking — D22: GHN detail khi đơn ship qua GHN,
     * flat fallback (carrier "flat") — shape contract TrackingResponse.
     * Chủ đơn only (repo theo user).
     */
    @GetMapping("/me/orders/{id}/tracking")
    public TrackingResponseDto myOrderTracking(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Order order = orders.findByIdAndUserId(id, UUID.fromString(jwt.getSubject()))
            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn"));
        return shipping.trackingFor(order);
    }
}
