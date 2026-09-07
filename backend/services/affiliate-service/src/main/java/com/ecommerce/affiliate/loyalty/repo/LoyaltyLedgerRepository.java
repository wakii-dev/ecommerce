package com.ecommerce.affiliate.loyalty.repo;

import com.ecommerce.affiliate.loyalty.domain.LoyaltyLedgerEntry;
import com.ecommerce.affiliate.loyalty.domain.LoyaltyLedgerType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LoyaltyLedgerRepository extends JpaRepository<LoyaltyLedgerEntry, UUID> {

    /** Idempotency earn/redeem theo đơn (UNIQUE(order_id, type) lớp DB). */
    boolean existsByOrderIdAndType(String orderId, LoyaltyLedgerType type);

    Optional<LoyaltyLedgerEntry> findByOrderIdAndType(String orderId, LoyaltyLedgerType type);

    Page<LoyaltyLedgerEntry> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
}
