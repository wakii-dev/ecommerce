package com.ecommerce.catalog.repo;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ecommerce.catalog.domain.ProductImageEntity;

/**
 * Repository ảnh product — sort preserved by {@code position}
 * (position 0 = ảnh đại diện ProductCard).
 */
public interface ProductImageRepository extends JpaRepository<ProductImageEntity, UUID> {

    /** Hydrate ảnh cho cả trang (1 query IN — tránh N+1 khi map ProductCard). */
    List<ProductImageEntity> findByProductIdInOrderByPositionAsc(Collection<UUID> productIds);

    /** Gallery PDP — sort theo position. */
    List<ProductImageEntity> findByProductIdOrderByPositionAsc(UUID productId);

    /** Write replace-all (Task 8b): xóa hết ảnh rồi insert lại theo payload. */
    void deleteByProductId(UUID productId);
}
