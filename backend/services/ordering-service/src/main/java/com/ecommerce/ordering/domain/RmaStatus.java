package com.ecommerce.ordering.domain;

import java.util.Map;
import java.util.Set;

/**
 * Lifecycle RMA (D22) — pin contracts/openapi/ordering.yaml RmaStatus:
 *
 * <pre>
 * REQUESTED → APPROVED (admin duyệt) → RECEIVED (admin nhận hàng) → REFUNDED (hoàn tiền — terminal)
 * REQUESTED → REJECTED (terminal)
 * </pre>
 *
 * Mọi transition khác → 409 (guard service, khớp contract "Trang thai khong cho phep").
 */
public enum RmaStatus {

    REQUESTED,
    APPROVED,
    RECEIVED,
    REFUNDED,
    REJECTED;

    private static final Map<RmaStatus, Set<RmaStatus>> ALLOWED = Map.of(
        REQUESTED, Set.of(APPROVED, REJECTED),
        APPROVED, Set.of(RECEIVED),
        RECEIVED, Set.of(REFUNDED),
        REFUNDED, Set.of(),
        REJECTED, Set.of()
    );

    public boolean canTransitionTo(RmaStatus target) {
        return ALLOWED.getOrDefault(this, Set.of()).contains(target);
    }

    public boolean isTerminal() {
        return this == REFUNDED || this == REJECTED;
    }
}
