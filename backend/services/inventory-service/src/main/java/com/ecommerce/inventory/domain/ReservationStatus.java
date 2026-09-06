package com.ecommerce.inventory.domain;

/**
 * Trạng thái reservation (pack SF-5 pin):
 * RESERVED → COMMITTED (order.paid) | RELEASED (order.cancelled/failed/TTL).
 * Transition đều guarded (WHERE status='RESERVED') — rowcount-gated events.
 */
public enum ReservationStatus {
    RESERVED, COMMITTED, RELEASED
}
