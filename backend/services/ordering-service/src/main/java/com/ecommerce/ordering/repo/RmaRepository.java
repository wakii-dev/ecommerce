package com.ecommerce.ordering.repo;

import com.ecommerce.ordering.domain.Rma;
import com.ecommerce.ordering.domain.RmaStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RmaRepository extends JpaRepository<Rma, UUID> {

    /** List RMA của tôi — mới nhất trước (contract listMyRmas). */
    Page<Rma> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** Admin queue — filter status (contract adminListRmas; null = tất cả). */
    Page<Rma> findByStatusOrderByCreatedAtDesc(RmaStatus status, Pageable pageable);

    Page<Rma> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** Double-refund guard: đã có RMA REFUNDED cho đơn này chưa. */
    boolean existsByOrderIdAndStatus(UUID orderId, RmaStatus status);

    /** RMA của đơn (list trong my-order detail). */
    List<Rma> findByOrderIdOrderByCreatedAtDesc(UUID orderId);
}
