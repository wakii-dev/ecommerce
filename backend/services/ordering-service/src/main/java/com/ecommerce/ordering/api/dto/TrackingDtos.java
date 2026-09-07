package com.ecommerce.ordering.api.dto;

import java.util.List;

/** DTO tracking (D22) — khớp contract TrackingResponse/TrackingEvent. */
public final class TrackingDtos {

    private TrackingDtos() {
    }

    public record TrackingResponseDto(
        String trackingCode,
        String carrier,
        String status,
        List<EventDto> events
    ) {
    }

    public record EventDto(String at, String description) {
    }
}
