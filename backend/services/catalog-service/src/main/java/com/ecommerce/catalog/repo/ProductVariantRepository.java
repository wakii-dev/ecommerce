package com.ecommerce.catalog.repo;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.ecommerce.catalog.domain.ProductVariantEntity;

/**
 * Repository variant — không có stock cột (SF-5 sở hữu); đọc trả stock 0.
 */
public interface ProductVariantRepository extends JpaRepository<ProductVariantEntity, UUID> {

    List<ProductVariantEntity> findByProductIdIn(Collection<UUID> productIds);

    /** Thứ tự ổn định theo thời điểm tạo; tiebreak id — insert cùng timestamp không nhảy thứ tự. */
    @Query("select v from ProductVariantEntity v where v.productId = :productId order by v.createdAt asc, v.id asc")
    List<ProductVariantEntity> findByProductIdOrderByCreatedAtAsc(UUID productId);

    /** Write replace-all (Task 8b): xóa hết variant rồi insert lại theo payload. */
    void deleteByProductId(UUID productId);
}
