package com.ecommerce.catalog.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ecommerce.catalog.domain.ReviewEntity;
import com.ecommerce.catalog.domain.ReviewStatus;

/**
 * Repository review (SF-8) — public list CHỈ APPROVED; me/reviews theo user;
 * breakdown GROUP BY rating (fill 0 phía service để "5".."1" luôn đủ key).
 */
public interface ReviewRepository extends JpaRepository<ReviewEntity, UUID> {

    /** Policy 1 review/user/product (UNIQUE V11 race-safe — service vẫn check trước để trả 409 êm). */
    boolean existsByUserIdAndProductId(UUID userId, UUID productId);

    /** Public list PDP — CHỈ APPROVED, mới nhất trước (Conventions spec Q5). */
    Page<ReviewEntity> findByProductIdAndStatusOrderByCreatedAtDesc(UUID productId, ReviewStatus status, Pageable pageable);

    /** Breakdown rating: số lượng theo sao, chỉ APPROVED (spec Q5). */
    @Query("""
        select r.rating as rating, count(r) as total
        from ReviewEntity r
        where r.productId = :productId and r.status = 'APPROVED'
        group by r.rating
        """)
    List<RatingCount> countByProductGroupByRating(@Param("productId") UUID productId);

    /** me/reviews — mọi status, mới nhất trước; filter productId optional (service chọn method). */
    Page<ReviewEntity> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    Page<ReviewEntity> findByUserIdAndProductIdOrderByCreatedAtDesc(UUID userId, UUID productId, Pageable pageable);

    /** Danh sách productId đã review (PDP my-pending panel dùng qua filter productId riêng — helper cho test). */
    List<ReviewEntity> findByUserIdAndProductId(UUID userId, UUID productId);

    /** Projection GROUP BY — rating int + count long. */
    interface RatingCount {

        int getRating();

        long getTotal();
    }
}
