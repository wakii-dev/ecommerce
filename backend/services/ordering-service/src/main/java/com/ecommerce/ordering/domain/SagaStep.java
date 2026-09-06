package com.ecommerce.ordering.domain;

/**
 * Bước saga checkout (§3.3) — ghi vào saga_state để debug/replay dễ nhìn.
 * Thứ tự: RE_PRICE → COUPON_RESERVED → INVENTORY_RESERVED → PAYMENT_INTENT →
 * DONE. FAILED là trạng thái dừng (kèm order.failed event).
 */
public enum SagaStep {
    RE_PRICE,
    COUPON_RESERVED,
    INVENTORY_RESERVED,
    PAYMENT_INTENT,
    DONE,
    FAILED
}
