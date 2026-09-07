package com.ecommerce.catalog.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ecommerce.catalog.domain.WishlistItemEntity;

/**
 * Repository wishlist (SF-8) — unique pair (user, product). PUT idempotent
 * qua {@code insertIgnore}; DELETE luôn 204 (contract — xóa row không có vẫn
 * 204, đếm rowcount không bắt buộc).
 */
public interface WishlistItemRepository extends JpaRepository<WishlistItemEntity, WishlistItemEntity.Pk> {

    /** Trang wishlist — mới thêm trước (service enrich ProductCard theo thứ tự này). */
    Page<WishlistItemEntity> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** /ids — toàn bộ productId (contract không phân trang), mới thêm trước. */
    List<WishlistItemEntity> findByUserIdOrderByCreatedAtDesc(UUID userId);

    boolean existsByUserIdAndProductId(UUID userId, UUID productId);

    Optional<WishlistItemEntity> findByUserIdAndProductId(UUID userId, UUID productId);

    /** Idempotent add — trả 1 nếu row mới, 0 nếu đã có. */
    @Modifying
    @Query(value = """
        INSERT INTO wishlist_items (user_id, product_id)
        VALUES (:userId, :productId)
        ON CONFLICT DO NOTHING
        """, nativeQuery = true)
    int insertIgnore(@Param("userId") UUID userId, @Param("productId") UUID productId);

    /** Idempotent remove — trả số row xóa được (0 = không có, vẫn 204). */
    @Modifying
    @Query(value = "DELETE FROM wishlist_items WHERE user_id = :userId AND product_id = :productId", nativeQuery = true)
    int deletePair(@Param("userId") UUID userId, @Param("productId") UUID productId);
}
