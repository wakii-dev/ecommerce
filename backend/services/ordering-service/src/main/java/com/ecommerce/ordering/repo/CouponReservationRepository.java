package com.ecommerce.ordering.repo;

import com.ecommerce.ordering.domain.CouponReservation;
import com.ecommerce.ordering.domain.CouponReservationStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface CouponReservationRepository extends JpaRepository<CouponReservation, UUID> {

    Optional<CouponReservation> findByOrderId(UUID orderId);

    /**
     * Guarded transition (rowcount-gated như reservations của inventory):
     * RESERVED → RELEASED / FINALIZED. Rowcount 0 = path khác đã xử lý
     * (re-delivery / race consumer vs sweeper) → caller skip, không release
     * hai lần (used_count không âm vĩnh viễn).
     */
    @Modifying
    @Query("UPDATE CouponReservation r SET r.status = :to, r.updatedAt = CURRENT_TIMESTAMP "
        + "WHERE r.orderId = :orderId AND r.status = :from")
    int transition(@Param("orderId") UUID orderId,
                   @Param("from") CouponReservationStatus from,
                   @Param("to") CouponReservationStatus to);
}
