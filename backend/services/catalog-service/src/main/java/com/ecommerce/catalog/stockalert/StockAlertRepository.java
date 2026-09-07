package com.ecommerce.catalog.stockalert;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface StockAlertRepository extends JpaRepository<StockAlertEntity, UUID> {

    List<StockAlertEntity> findByStatus(String status);

    boolean existsByUserEmailAndVariantIdAndStatus(String userEmail, UUID variantId, String status);

    List<StockAlertEntity> findByIdInAndStatusAndNotifiedAt(Collection<UUID> ids, String status, Instant notifiedAt);

    /** Atomic claim — 2 poller tranh nhau chỉ 1 flip thành công (exactly-once email). */
    @Modifying
    @Query("update StockAlertEntity a set a.status = 'NOTIFIED', a.notifiedAt = :now " +
        "where a.id in :ids and a.status = 'ACTIVE'")
    int claimAll(@Param("ids") Collection<UUID> ids, @Param("now") Instant now);
}
