package com.ecommerce.common.outbox;

/**
 * Vòng đời row outbox: PENDING → SENT; PENDING → FAILED khi hết
 * {@code outbox.relay.max-attempts} (dead-letter convention: FAILED giữ nguyên
 * row + {@code lastError} để ops debug/requeue tay — relay KHÔNG tự xóa).
 */
public enum OutboxStatus {
    PENDING,
    SENT,
    FAILED
}
