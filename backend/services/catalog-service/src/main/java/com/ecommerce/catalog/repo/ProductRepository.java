package com.ecommerce.catalog.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import com.ecommerce.catalog.domain.ProductEntity;

/**
 * Repository product — public GET khớp slug_vi HOẶC slug_en (Conventions #5).
 * Filters/sort động (price/rating/brand/official/discount) qua
 * {@link JpaSpecificationExecutor} + {@link ProductSpecs}.
 */
public interface ProductRepository extends JpaRepository<ProductEntity, UUID>, JpaSpecificationExecutor<ProductEntity> {

    /** Public PDP: tìm theo slug bất kỳ locale — service tự lọc PUBLISHED + chưa soft-delete. */
    Optional<ProductEntity> findBySlugViOrSlugEn(String slugVi, String slugEn);

    /** Seed flash-refresh (Q12): mọi product có flash_sale_ends_at. */
    List<ProductEntity> findByFlashSaleEndsAtIsNotNull();

    /** Guard DELETE category (Task 8b): còn product CHƯA soft-delete trong danh mục → 409. */
    boolean existsByCategoryIdAndDeletedAtIsNull(UUID categoryId);

    /**
     * Guard DELETE category (Task 8b) — hard-delete danh mục cần gỡ FK từ các
     * row product ĐÃ soft-delete (row giữ nguyên cho order/review tham chiếu,
     * nhưng category_id không còn nghĩa → set NULL trong cùng tx để FK bật qua).
     */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query(
        "update ProductEntity p set p.categoryId = null where p.categoryId = :categoryId and p.deletedAt is not null")
    int detachSoftDeletedFromCategory(@org.springframework.data.repository.query.Param("categoryId") UUID categoryId);
}
