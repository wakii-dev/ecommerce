package com.ecommerce.catalog.domain;

import java.util.UUID;

import org.hibernate.annotations.UuidGenerator;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Ảnh product — sort theo {@code position} (0 = ảnh đại diện ProductCard).
 */
@Entity
@Table(name = "product_images")
public class ProductImageEntity {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(nullable = false)
    private String url;

    private String alt;

    @Column(nullable = false)
    private int position = 0;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getProductId() { return productId; }
    public void setProductId(UUID productId) { this.productId = productId; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getAlt() { return alt; }
    public void setAlt(String alt) { this.alt = alt; }

    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
}
