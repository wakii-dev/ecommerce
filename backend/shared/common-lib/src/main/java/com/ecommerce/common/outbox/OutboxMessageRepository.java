package com.ecommerce.common.outbox;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OutboxMessageRepository extends JpaRepository<OutboxMessage, UUID> {

    /** Batch có hạn (Limit) — relay không kéo cả bảng PENDING vào bộ nhớ. */
    List<OutboxMessage> findByStatusOrderByIdAsc(OutboxStatus status, Limit limit);
}
