package com.ecommerce.catalog.domain;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Biến thể product — {@code price} NULL = không override; giá trị = giá
 * TUYỆT ĐỐI của biến thể (contract gửi priceDelta → service cộng khi ghi,
 * Task 8). KHÔNG cột stock — stock là inventory (SF-5).
 */
@Entity
@Table(name = "product_variants")
public class ProductVariantEntity {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    /** Tên biến thể i18n — nullable (fallback ghép "color / size" khi đọc, Task 3). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "name_i18n")
    private I18nText nameI18n;

    private String size;

    private String color;

    /** Override tuyệt đối (VND); null = dùng product.price. */
    private Long price;

    @Column(name = "sku_code")
    private String skuCode;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getProductId() { return productId; }
    public void setProductId(UUID productId) { this.productId = productId; }

    public I18nText getNameI18n() { return nameI18n; }
    public void setNameI18n(I18nText nameI18n) { this.nameI18n = nameI18n; }

    public String getSize() { return size; }
    public void setSize(String size) { this.size = size; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    public Long getPrice() { return price; }
    public void setPrice(Long price) { this.price = price; }

    public String getSkuCode() { return skuCode; }
    public void setSkuCode(String skuCode) { this.skuCode = skuCode; }

    public Instant getCreatedAt() { return createdAt; }
}
