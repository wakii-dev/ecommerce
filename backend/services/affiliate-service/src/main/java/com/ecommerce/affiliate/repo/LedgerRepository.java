package com.ecommerce.affiliate.repo;

import com.ecommerce.affiliate.domain.LedgerEntry;
import com.ecommerce.affiliate.domain.LedgerStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface LedgerRepository extends JpaRepository<LedgerEntry, UUID> {

    Optional<LedgerEntry> findByOrderId(String orderId);

    Page<LedgerEntry> findByAffiliateIdOrderByCreatedAtDesc(UUID affiliateId, Pageable pageable);

    long countByAffiliateId(UUID affiliateId);

    /** Gỡ entry khi order cancel/fail sau khi đã tạo (race) — CHỈ entry chưa CONFIRMED. */
    long deleteByOrderIdAndStatus(String orderId, LedgerStatus status);

    // ── stats ───────────────────────────────────────────────────────────────

    @Query("SELECT COALESCE(SUM(l.commission), 0) FROM LedgerEntry l WHERE l.affiliateId = :affiliateId")
    long sumCommissionByAffiliateId(@Param("affiliateId") UUID affiliateId);

    /** Admin stats — conversions trong khoảng. */
    long countByCreatedAtBetween(Instant from, Instant to);

    /** Admin stats — tổng hoa hồng VND trong khoảng. */
    @Query("SELECT COALESCE(SUM(l.commission), 0) FROM LedgerEntry l WHERE l.createdAt BETWEEN :from AND :to")
    long sumCommissionBetween(@Param("from") Instant from, @Param("to") Instant to);
}
