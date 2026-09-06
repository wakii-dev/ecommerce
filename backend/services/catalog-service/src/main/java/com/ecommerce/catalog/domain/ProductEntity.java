package com.ecommerce.catalog.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Product — khớp V10 {@code products} (search_vec GENERATED không map — chỉ
 * dùng qua native query PgFtsEngine, Task 4).
 */
@Entity
@Table(name = "products")
public class ProductEntity {

    @Id
    @UuidGenerator
    private UUID id;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private I18nText name;

    @Column(name = "slug_vi", nullable = false, unique = true)
    private String slugVi;

    @Column(name = "slug_en", nullable = false, unique = true)
    private String slugEn;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private I18nText description;

    private String brand;

    @Column(name = "category_id")
    private UUID categoryId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductStatus status = ProductStatus.DRAFT;

    /** Giá VND integer (bigint). */
    @Column(nullable = false)
    private long price;

    /** Giá gạch (trước giảm) — null = không có discount. */
    private Long comparePrice;

    private Instant flashSaleEndsAt;

    @Column(nullable = false)
    private boolean official = false;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]")
    private List<String> tags = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    private I18nText seoTitle;

    @JdbcTypeCode(SqlTypes.JSON)
    private I18nText seoDescription;

    @Column(name = "rating_avg", nullable = false)
    private java.math.BigDecimal ratingAvg = java.math.BigDecimal.ZERO;

    @Column(name = "rating_count", nullable = false)
    private int ratingCount = 0;

    /** Soft-delete — set khi admin DELETE; public API lọc IS NULL. */
    private Instant deletedAt;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public I18nText getName() { return name; }
    public void setName(I18nText name) { this.name = name; }

    public String getSlugVi() { return slugVi; }
    public void setSlugVi(String slugVi) { this.slugVi = slugVi; }

    public String getSlugEn() { return slugEn; }
    public void setSlugEn(String slugEn) { this.slugEn = slugEn; }

    public I18nText getDescription() { return description; }
    public void setDescription(I18nText description) { this.description = description; }

    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }

    public UUID getCategoryId() { return categoryId; }
    public void setCategoryId(UUID categoryId) { this.categoryId = categoryId; }

    public ProductStatus getStatus() { return status; }
    public void setStatus(ProductStatus status) { this.status = status; }

    public long getPrice() { return price; }
    public void setPrice(long price) { this.price = price; }

    public Long getComparePrice() { return comparePrice; }
    public void setComparePrice(Long comparePrice) { this.comparePrice = comparePrice; }

    public Instant getFlashSaleEndsAt() { return flashSaleEndsAt; }
    public void setFlashSaleEndsAt(Instant flashSaleEndsAt) { this.flashSaleEndsAt = flashSaleEndsAt; }

    public boolean isOfficial() { return official; }
    public void setOfficial(boolean official) { this.official = official; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }

    public I18nText getSeoTitle() { return seoTitle; }
    public void setSeoTitle(I18nText seoTitle) { this.seoTitle = seoTitle; }

    public I18nText getSeoDescription() { return seoDescription; }
    public void setSeoDescription(I18nText seoDescription) { this.seoDescription = seoDescription; }

    public java.math.BigDecimal getRatingAvg() { return ratingAvg; }
    public void setRatingAvg(java.math.BigDecimal ratingAvg) { this.ratingAvg = ratingAvg; }

    public int getRatingCount() { return ratingCount; }
    public void setRatingCount(int ratingCount) { this.ratingCount = ratingCount; }

    public Instant getDeletedAt() { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }

    public Instant getCreatedAt() { return createdAt; }

    /** Flash deal còn hiệu lực (storefront tự lọc từ response — không endpoint riêng). */
    public boolean isFlashActive() {
        return flashSaleEndsAt != null && flashSaleEndsAt.isAfter(Instant.now());
    }
}
