package com.ecommerce.ordering.api.dto;

import com.ecommerce.ordering.domain.OrderStatus;
import com.ecommerce.ordering.domain.TimelineEntry;

import java.time.Instant;

/** Khớp contract Order.timeline entry: {status, at}. */
public record TimelineEntryDto(OrderStatus status, Instant at) {

    public static TimelineEntryDto from(TimelineEntry entry) {
        return new TimelineEntryDto(entry.status(), entry.at());
    }
}
