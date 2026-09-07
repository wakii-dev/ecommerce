package com.ecommerce.partner.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Idempotency layer 1: (partner_id, partner_ref) UNIQUE — partner gửi lại
 * cùng ref → trả đơn cũ ngay, không gọi ordering. order_id UNIQUE ngược —
 * 1 đơn thuộc đúng 1 partner (webhook lookup O(1)).
 */
@Entity
@Table(name = "partner_order_refs")
public class PartnerOrderRefEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "partner_ref", nullable = false, length = 128)
    private String partnerRef;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getPartnerId() { return partnerId; }
    public void setPartnerId(UUID partnerId) { this.partnerId = partnerId; }
    public String getPartnerRef() { return partnerRef; }
    public void setPartnerRef(String partnerRef) { this.partnerRef = partnerRef; }
    public UUID getOrderId() { return orderId; }
    public void setOrderId(UUID orderId) { this.orderId = orderId; }
    public Instant getCreatedAt() { return createdAt; }
}
