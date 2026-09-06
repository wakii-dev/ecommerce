package com.ecommerce.ordering.service;

import com.ecommerce.ordering.domain.OrderStatus;
import com.ecommerce.ordering.repo.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Safety net TTL (pack): order PENDING quá 35' → CANCELLED + release coupon +
 * outbox order.cancelled (→ inventory release nếu reservation còn). Đường CHÍNH
 * là inventory sweeper (TTL 30' → inventory.released → consumer cancel); sweeper
 * này chỉ bắt event-miss / inventory chết lâu. Guarded trong lifecycle.
 */
@Component
public class OrderTtlSweeper {

    private static final Logger log = LoggerFactory.getLogger(OrderTtlSweeper.class);
    private static final int BATCH_SIZE = 100;

    private final OrderRepository orders;
    private final OrderLifecycleService lifecycle;
    private final long ttlCancelSeconds;

    public OrderTtlSweeper(
        OrderRepository orders,
        OrderLifecycleService lifecycle,
        @Value("${ordering.ttl-cancel-seconds:2100}") long ttlCancelSeconds
    ) {
        this.orders = orders;
        this.lifecycle = lifecycle;
        this.ttlCancelSeconds = ttlCancelSeconds;
    }

    @Scheduled(fixedDelayString = "${ordering.sweep-interval-ms:30000}")
    public void cancelStalePending() {
        Instant threshold = Instant.now().minusSeconds(ttlCancelSeconds);
        var stale = orders.findByStatusAndCreatedAtBefore(OrderStatus.PENDING, threshold, Limit.of(BATCH_SIZE));
        stale.forEach(lifecycle::cancelExpiredPending);
        if (!stale.isEmpty()) {
            log.info("TTL sweeper: hủy {} đơn PENDING quá {}s", stale.size(), ttlCancelSeconds);
        }
    }
}
