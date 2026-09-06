package com.ecommerce.catalog.repo;

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
}
