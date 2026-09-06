package com.ecommerce.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Reservation tồn kho TTL (pack SF-5): {@code items} jsonb SNAKE_CASE
 * (xem {@link ReservationItem} — casing PIN). Status transition đều qua
 * guarded conditional update {@code WHERE status='RESERVED'} (repo).
 */
@Entity
@Table(name = "reservations")
public class Reservation {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "order_id", nullable = false, length = 64)
    private String orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ReservationStatus status;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<ReservationItem> items = new ArrayList<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Reservation() {
    }

    public Reservation(String orderId, ReservationStatus status, Instant expiresAt, List<ReservationItem> items) {
        this.orderId = orderId;
        this.status = status;
        this.expiresAt = expiresAt;
        this.items = new ArrayList<>(items);
    }

    public UUID getId() {
        return id;
    }

    public String getOrderId() {
        return orderId;
    }

    public ReservationStatus getStatus() {
        return status;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public List<ReservationItem> getItems() {
        return items;
    }
}
