package com.ecommerce.partner.repo;

import com.ecommerce.partner.domain.DeliveryStatus;
import com.ecommerce.partner.domain.WebhookDeliveryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface WebhookDeliveryRepository extends JpaRepository<WebhookDeliveryEntity, UUID> {

    /** Scheduler: PENDING đến hạn retry (next_retry_at <= mốc). */
    List<WebhookDeliveryEntity> findByDeliveryStatusAndNextRetryAtLessThanEqual(DeliveryStatus status, Instant until);
}
