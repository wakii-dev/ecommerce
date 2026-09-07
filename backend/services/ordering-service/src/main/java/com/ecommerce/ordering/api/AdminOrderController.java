package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.PageDtos.OrderPageDto;
import com.ecommerce.ordering.api.dto.OrderDto;
import com.ecommerce.ordering.api.dto.StatsDtos.OrdersSummaryDto;
import com.ecommerce.ordering.api.dto.StatsDtos.RevenueByDayDto;
import com.ecommerce.ordering.api.dto.StatsDtos.TopProductDto;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderStatus;
import com.ecommerce.ordering.repo.OrderRepository;
import com.ecommerce.ordering.service.OrderLifecycleService;
import com.ecommerce.ordering.service.invoice.InvoiceProvider;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Admin APIs (§3.6 + stats §6.1.8) — 2 lớp guard: gateway admin-prefix +
 * {@code @PreAuthorize("hasRole('ADMIN')")} (defense in depth §3.4).
 * KHÔNG có endpoint confirm — CONFIRMED tự động (pin §3.6).
 */
@RestController
@RequestMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminOrderController {

    private static final int MAX_PAGE_SIZE = 100;

    private final OrderRepository orders;
    private final OrderLifecycleService lifecycle;
    private final InvoiceProvider invoiceProvider;

    public AdminOrderController(OrderRepository orders, OrderLifecycleService lifecycle,
                                InvoiceProvider invoiceProvider) {
        this.orders = orders;
        this.lifecycle = lifecycle;
        this.invoiceProvider = invoiceProvider;
    }

    /** GET /admin/orders — filter status + q (id/email/tên trong address), paginate. */
    @GetMapping("/orders")
    public OrderPageDto list(
        @RequestParam(required = false) OrderStatus status,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size) {
        Specification<Order> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                    cb.like(cb.lower(root.get("email")), like),
                    cb.equal(root.get("id").as(String.class), q.trim())));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
        Page<OrderDto> result = orders
            .findAll(spec, PageRequest.of(Math.max(0, page - 1), Math.min(size, MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt")))
            .map(OrderDto::from);
        return OrderPageDto.of(result);
    }

    /** GET /admin/orders/{id} — detail đầy đủ items + timeline + address. */
    @GetMapping("/orders/{id}")
    public OrderDto detail(@PathVariable UUID id) {
        return orders.findById(id).map(OrderDto::from)
            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn"));
    }

    /** POST /admin/orders/{id}/ship — CONFIRMED → SHIPPED (§3.6); tracking tự cấp nếu thiếu. */
    @PostMapping("/orders/{id}/ship")
    public OrderDto ship(@PathVariable UUID id) {
        Order o = orders.findById(id).orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn"));
        if (o.getStatus() != OrderStatus.CONFIRMED) {
            throw new InvalidStateTransitionException("Chỉ đơn CONFIRMED ship được — đơn đang " + o.getStatus());
        }
        o.transitionTo(OrderStatus.SHIPPED);
        if (o.getTrackingCode() == null) {
            o.markShipped("TRK-" + o.getId().toString().substring(0, 8).toUpperCase(Locale.ROOT));
        }
        return OrderDto.from(orders.save(o));
    }

    /** POST /admin/orders/{id}/deliver — SHIPPED → DELIVERED (§3.6). */
    @PostMapping("/orders/{id}/deliver")
    public OrderDto deliver(@PathVariable UUID id) {
        Order o = orders.findById(id).orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn"));
        if (o.getStatus() != OrderStatus.SHIPPED) {
            throw new InvalidStateTransitionException("Chỉ đơn SHIPPED deliver được — đơn đang " + o.getStatus());
        }
        o.transitionTo(OrderStatus.DELIVERED);
        return OrderDto.from(orders.save(o));
    }

    /**
     * POST /admin/orders/{id}/cancel — PENDING/PAID/CONFIRMED → CANCELLED (§3.6);
     * hủy sau PAID tự động refund (contract — server lo, admin không gọi refund riêng).
     * SHIPPED/DELIVERED/terminal → 409.
     */
    @PostMapping("/orders/{id}/cancel")
    public OrderDto cancel(@PathVariable UUID id) {
        return OrderDto.from(lifecycle.cancelByAdmin(id));
    }

    /** GET /admin/orders/{id}/invoice — PDF của đơn bất kỳ (D18), cùng ràng buộc CONFIRMED+. */
    @GetMapping(value = "/orders/{id}/invoice", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> invoice(@PathVariable UUID id) {
        Order order = orders.findById(id)
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

    /** GET /admin/stats/revenue-by-day — from/to yyyy-mm-dd inclusive (contract). */
    @GetMapping("/stats/revenue-by-day")
    public List<RevenueByDayDto> revenueByDay(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        Instant fromTs = from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toTs = to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC); // exclusive — inclusive `to`
        return orders.revenueByDay(fromTs, toTs).stream()
            .map(v -> new RevenueByDayDto(v.getDay().toString(), v.getRevenue(), v.getOrders()))
            .toList();
    }

    /** GET /admin/stats/orders-summary — counts per status + doanh thu (§6.1.8). */
    @GetMapping("/stats/orders-summary")
    public OrdersSummaryDto ordersSummary() {
        Instant dayStart = LocalDate.now(ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
        var v = orders.ordersSummary(dayStart);
        return new OrdersSummaryDto(v.getPending(), v.getPaid(), v.getConfirmed(), v.getShipped(),
            v.getDelivered(), v.getCancelled(), v.getFailed(),
            v.getTotalRevenue(), v.getTodayRevenue(), v.getTodayOrders());
    }

    /** GET /admin/stats/top-products — top theo qty bán, mặc định 10 (contract). */
    @GetMapping("/stats/top-products")
    public List<TopProductDto> topProducts(
        @RequestParam(defaultValue = "10") int limit,
        @RequestParam(required = false) LocalDate from,
        @RequestParam(required = false) LocalDate to) {
        Instant fromTs = from != null ? from.atStartOfDay().toInstant(ZoneOffset.UTC) : Instant.EPOCH;
        Instant toTs = to != null ? to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)
            : Instant.now().plusSeconds(60);
        return orders.topProducts(fromTs, toTs, Math.max(1, Math.min(100, limit))).stream()
            .map(v -> new TopProductDto(v.getProductId().toString(), v.getName(), v.getQty(), v.getRevenue()))
            .toList();
    }
}
