package com.ecommerce.partner.repo;

import com.ecommerce.partner.domain.PartnerOrderRefEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PartnerOrderRefRepository extends JpaRepository<PartnerOrderRefEntity, UUID> {

    /** Idempotency layer 1 — replay cùng partnerRef của CÙNG partner. */
    Optional<PartnerOrderRefEntity> findByPartnerIdAndPartnerRef(UUID partnerId, String partnerRef);

    /** Webhook routing: event order.* → đơn này thuộc partner nào (unique). */
    Optional<PartnerOrderRefEntity> findByOrderId(UUID orderId);
}
