package com.ecommerce.ordering.domain;

import java.util.Map;
import java.util.Set;

/**
 * State machine đơn hàng — pin §3.6 (khớp OrderStatus.description trong
 * contracts/openapi/ordering.yaml — KHÔNG thêm transition ngoài bảng).
 *
 * <pre>
 * PENDING → PAID (system webhook) → CONFIRMED (system commit) → SHIPPED (admin) → DELIVERED (admin)
 * PENDING → CONFIRMED (SF-13 COD — sau reserve, không qua Stripe; PAID thật lúc giao qua capture)
 * PENDING → CANCELLED (admin / user / TTL 30' system)
 * PAID | CONFIRMED → CANCELLED (admin — kèm refund)
 * PENDING → FAILED (system: reserve fail / declined)
 * </pre>
 *
 * Admin KHÔNG có endpoint confirm — CONFIRMED tới từ PAID (Stripe) hoặc
 * PENDING (COD, D21). Trạng thái đơn COD kết thúc = DELIVERED — "PAID lúc
 * giao" là nghĩa vụ thanh toán (order.paid + capture), KHÔNG phải transition.
 */
public enum OrderStatus {

    PENDING,
    PAID,
    CONFIRMED,
    SHIPPED,
    DELIVERED,
    CANCELLED,
    FAILED;

    /** Transition hợp lệ: from → set đích. Mọi path khác → 409 (guard service). */
    private static final Map<OrderStatus, Set<OrderStatus>> ALLOWED = Map.of(
        PENDING, Set.of(PAID, CONFIRMED, CANCELLED, FAILED),
        PAID, Set.of(CONFIRMED, CANCELLED),
        CONFIRMED, Set.of(SHIPPED, CANCELLED),
        SHIPPED, Set.of(DELIVERED),
        DELIVERED, Set.of(),
        CANCELLED, Set.of(),
        FAILED, Set.of()
    );

    public boolean canTransitionTo(OrderStatus target) {
        return ALLOWED.getOrDefault(this, Set.of()).contains(target);
    }

    /** Trạng thái terminal — không transition nữa (late payment → refund path). */
    public boolean isTerminal() {
        return this == CANCELLED || this == FAILED || this == DELIVERED;
    }

    /** Đơn đã đủ điều kiện có hóa đơn (D18: CONFIRMED trở lên). */
    public boolean invoiceAvailable() {
        return this == CONFIRMED || this == SHIPPED || this == DELIVERED;
    }

    /** Đơn đã được thanh toán tiền thật (tính doanh thu admin stats). */
    public boolean revenueCounted() {
        return this == PAID || this == CONFIRMED || this == SHIPPED || this == DELIVERED;
    }

    /** Đơn đã trả tiền hoặc chắc chắn mất tiền — dùng cho tính refunds. */
    public boolean paidLike() {
        return this == PAID || this == CONFIRMED || this == SHIPPED || this == DELIVERED;
    }
}
