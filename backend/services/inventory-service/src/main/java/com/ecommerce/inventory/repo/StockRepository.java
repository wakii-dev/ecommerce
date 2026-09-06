package com.ecommerce.inventory.repo;

import com.ecommerce.inventory.domain.Stock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface StockRepository extends JpaRepository<Stock, String> {

    /**
     * Lock đủ TẤT CẢ variant cần reserve trong MỘT câu — ORDER BY variant_id
     * (thứ tự lock cố định, chống deadlock đa-request) + FOR UPDATE (spec §4.2
     * bước 4, pack pin "row-lock SELECT ... FOR UPDATE").
     */
    @Query(value = "SELECT * FROM stocks WHERE variant_id IN (:ids) ORDER BY variant_id FOR UPDATE", nativeQuery = true)
    List<Stock> lockAllForUpdate(@Param("ids") Collection<String> ids);

    /** Reserve trừ available (trong tx duy nhất của reservation). */
    @Modifying
    @Query("UPDATE Stock s SET s.quantity = s.quantity - :qty, s.updatedAt = CURRENT_TIMESTAMP WHERE s.variantId = :id")
    int deduct(@Param("id") String variantId, @Param("qty") int qty);

    /** Release hoàn available (TTL sweep / order.cancelled / order.failed). */
    @Modifying
    @Query("UPDATE Stock s SET s.quantity = s.quantity + :qty, s.updatedAt = CURRENT_TIMESTAMP WHERE s.variantId = :id")
    int restock(@Param("id") String variantId, @Param("qty") int qty);
}
