package com.ecommerce.affiliate.repo;

import com.ecommerce.affiliate.domain.Affiliate;
import com.ecommerce.affiliate.domain.AffiliateStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface AffiliateRepository extends JpaRepository<Affiliate, UUID> {

    Optional<Affiliate> findByUserId(UUID userId);

    Optional<Affiliate> findByCode(String code);

    Page<Affiliate> findByStatus(AffiliateStatus status, Pageable pageable);

    /** Admin stats — tổng hồ sơ (mọi trạng thái) trong khoảng. */
    long countByCreatedAtBetween(Instant from, Instant to);
}
