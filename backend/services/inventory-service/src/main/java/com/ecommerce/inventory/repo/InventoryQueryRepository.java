package com.ecommerce.inventory.repo;

import com.ecommerce.inventory.domain.Stock;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/**
 * Query đọc-only cho availability + low-stock — repository RIÊNG (không đụng
 * StockRepository của reservation path; query jsonb reserved không belongs
 * tới write model).
 */
public interface InventoryQueryRepository extends Repository<Stock, String> {

    /**
     * `reserved` = SUM qty jsonb items của reservation RESERVED còn hạn
     * (expires_at > now()) — variant hết hạn chưa quét tự động rơi khỏi tính
     * (lazy correctness bổ sung cho sweeper). Chỉ trả variant CÓ row stocks
     * (contract: "chi tra nhung variant ton tai").
     */
    @org.springframework.data.jpa.repository.Query(value = """
        SELECT s.variant_id AS variantId,
               s.quantity AS available,
               COALESCE(r.reserved, 0) AS reserved
        FROM stocks s
        LEFT JOIN (
            SELECT item->>'variant_id' AS vid, SUM((item->>'qty')::int) AS reserved
            FROM reservations, jsonb_array_elements(items) AS item
            WHERE status = 'RESERVED' AND expires_at > now()
            GROUP BY 1
        ) r ON r.vid = s.variant_id
        WHERE s.variant_id IN (:ids)
        """, nativeQuery = true)
    List<VariantAvailabilityView> findAvailability(@Param("ids") Collection<String> ids);

    /** Low-stock: available <= threshold, order tăng dần (dashboard ưu tiên hết hàng trước). */
    @org.springframework.data.jpa.repository.Query(value = """
        SELECT variant_id AS variantId, product_id AS productId, product_name AS productName,
               quantity AS available, threshold_low AS threshold
        FROM stocks WHERE quantity <= :threshold ORDER BY quantity ASC
        """, nativeQuery = true)
    List<LowStockView> findLowStock(@Param("threshold") int threshold);
}
