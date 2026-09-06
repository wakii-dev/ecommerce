package com.ecommerce.inventory.repo;

import com.ecommerce.inventory.domain.Reservation;
import com.ecommerce.inventory.domain.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    /** Reservation duy nhất của order theo trạng thái (partial unique index: ≤1 active). */
    Optional<Reservation> findFirstByOrderIdAndStatusOrderByCreatedAtDesc(String orderId, ReservationStatus status);

    /** Reservation active = RESERVED còn hạn (định nghĩa "active" pin spec §4.2). */
    Optional<Reservation> findFirstByOrderIdAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
        String orderId, ReservationStatus status, Instant now);

    /**
     * GUARDED conditional transition — CHỈ thắng khi còn ở {@code from}.
     * Trả rowcount; 0 = đã bị consumer/sweep khác đổi trước (race sweep-vs-consumer:
     * không emit event, không hoàn/trừ stock lần 2 — spec §4.5/§4.6).
     */
    @Modifying
    @Query("UPDATE Reservation r SET r.status = :to WHERE r.id = :id AND r.status = :from")
    int transition(@Param("id") UUID id, @Param("from") ReservationStatus from, @Param("to") ReservationStatus to);
}
