package com.ecommerce.partner.domain;

/**
 * Vòng đời delivery webhook: PENDING (chưa 2xx, chờ attempt/retry theo
 * next_retry_at) → DELIVERED (2xx) | DEAD (quá max-attempts — DLQ bảng, ADR-11b).
 */
public enum DeliveryStatus {
    PENDING,
    DELIVERED,
    DEAD
}
