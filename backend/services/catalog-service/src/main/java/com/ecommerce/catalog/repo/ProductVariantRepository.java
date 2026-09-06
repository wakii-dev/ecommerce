package com.ecommerce.catalog.repo;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ecommerce.catalog.domain.ProductVariantEntity;

/**
 * Repository variant — không có stock cột (SF-5 sở hữu); đọc trả stock 0.
 */
public interface ProductVariantRepository extends JpaRepository<ProductVariantEntity, UUID> {

    List<ProductVariantEntity> findByProductIdIn(Collection<UUID> productIds);

    /** Thứ tự ổn định theo thời điểm tạo. */
    List<ProductVariantEntity> findByProductIdOrderByCreatedAtAsc(UUID productId);
}
