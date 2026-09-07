package com.ecommerce.log.web.dto;

import java.time.Instant;
import java.util.UUID;

/** 1 dòng audit log (SF-13 A5) — payload giữ nguyên JSON để FE xem chi tiết. */
public record EventLogItemDto(
    String id,
    UUID eventId,
    String eventType,
    Instant occurredAt,
    String correlationId,
    Object payload) {
}
