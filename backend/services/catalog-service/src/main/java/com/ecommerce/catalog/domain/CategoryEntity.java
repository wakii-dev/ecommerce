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
 * Category — cây qua {@code parent_id} self-fk (null = root), tên i18n JSONB.
 */
@Entity
@Table(name = "categories")
public class CategoryEntity {

    @Id
    @UuidGenerator
    private UUID id;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private I18nText name;

    @Column(name = "slug_vi", unique = true)
    private String slugVi;

    @Column(name = "slug_en", unique = true)
    private String slugEn;

    /** UUID của category cha — null = root (dùng UUID thay @ManyToOne để cây load 1 query). */
    @Column(name = "parent_id")
    private UUID parentId;

    /** Icon tile home — emoji hoặc tên gradient key (§1.8). */
    private String icon;

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

    public UUID getParentId() { return parentId; }
    public void setParentId(UUID parentId) { this.parentId = parentId; }

    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }

    public Instant getCreatedAt() { return createdAt; }
}
