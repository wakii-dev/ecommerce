package com.ecommerce.ordering.domain;

import java.time.Instant;

/**
 * Một dòng trong {@code orders.timeline} (jsonb) — khớp contract Order.timeline:
 * {@code {status, at}}. Append-only mỗi transition (khớp thứ tự thời gian).
 */
public record TimelineEntry(OrderStatus status, Instant at) {
}
