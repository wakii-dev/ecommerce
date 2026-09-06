package com.ecommerce.ordering.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Trạng thái saga checkout — 1 row / đơn (PK order_id). Chỉ là checkpoint quan
 * sát (debug + fail-injection tests) — source of truth của trạng thái đơn là
 * {@code orders.status}; step RE_PRICE → DONE theo §3.3.
 */
@Entity
@Table(name = "saga_state")
public class SagaState {

    @Id
    @Column(name = "order_id")
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private SagaStep step;

    @Column(name = "correlation_id", length = 64)
    private String correlationId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected SagaState() {
    }

    public SagaState(UUID orderId, SagaStep step, String correlationId) {
        this.orderId = orderId;
        this.step = step;
        this.correlationId = correlationId;
    }

    public UUID getOrderId() {
        return orderId;
    }

    public SagaStep getStep() {
        return step;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void advance(SagaStep next) {
        this.step = next;
        this.updatedAt = Instant.now();
    }
}
