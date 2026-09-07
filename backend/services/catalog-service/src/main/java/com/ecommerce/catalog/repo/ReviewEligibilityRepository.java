package com.ecommerce.catalog.repo;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ecommerce.catalog.domain.ReviewEligibilityEntity;

/**
 * Repository verified-purchase eligibility (SF-8). Insert duy nhất qua
 * {@code insertIgnore} native ON CONFLICT DO NOTHING (pattern
 * {@code ProcessedMessageRepository.insertIgnore} của common-lib) — consumer
 * {@code order.confirmed} gọi trong cùng tx với marker idempotency.
 */
public interface ReviewEligibilityRepository extends JpaRepository<ReviewEligibilityEntity, ReviewEligibilityEntity.Pk> {

    /** Submit review: badge verified = EXISTS lúc submit (spec Q4). */
    boolean existsByUserIdAndProductId(UUID userId, UUID productId);

    /** Dedupe DB-level — trả 1 nếu row mới, 0 nếu đã có (mua lại cùng product). */
    @Modifying
    @Query(value = """
        INSERT INTO review_eligibility (user_id, product_id, order_id)
        VALUES (:userId, :productId, :orderId)
        ON CONFLICT DO NOTHING
        """, nativeQuery = true)
    int insertIgnore(@Param("userId") UUID userId, @Param("productId") UUID productId, @Param("orderId") UUID orderId);
}
