package com.ecommerce.ordering.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.util.UUID;

/**
 * Dòng hàng — snapshot (name + unit price) tại thời điểm đặt (§6.1: catalog là
 * authority giá; cart chỉ là duyệt). {@code variantId} bắt buộc — reservation
 * tồn kho ở mức variant (pin §6.1.4).
 *
 * <p>SỞ HỮU FK {@code order_id} (bidirectional với {@link Order#items}
 * {@code mappedBy}) — unidirectional {@code @OneToMany + @JoinColumn} khiến
 * Hibernate INSERT con với FK NULL rồi UPDATE sau → vi phạm NOT NULL.</p>
 */
@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "variant_id", nullable = false)
    private UUID variantId;

    @Column(nullable = false)
    private String name;

    @Column(name = "unit_price", nullable = false)
    private long unitPrice;

    @Column(nullable = false)
    private int qty;

    @Column(name = "line_total", nullable = false)
    private long lineTotal;

    protected OrderItem() {
    }

    public OrderItem(UUID productId, UUID variantId, String name, long unitPrice, int qty) {
        this.productId = productId;
        this.variantId = variantId;
        this.name = name;
        this.unitPrice = unitPrice;
        this.qty = qty;
        this.lineTotal = (long) unitPrice * qty;
    }

    public UUID getId() {
        return id;
    }

    void setOrder(Order order) {
        this.order = order;
    }

    public Order getOrder() {
        return order;
    }

    public UUID getProductId() {
        return productId;
    }

    public UUID getVariantId() {
        return variantId;
    }

    public String getName() {
        return name;
    }

    public long getUnitPrice() {
        return unitPrice;
    }

    public int getQty() {
        return qty;
    }

    public long getLineTotal() {
        return lineTotal;
    }
}
