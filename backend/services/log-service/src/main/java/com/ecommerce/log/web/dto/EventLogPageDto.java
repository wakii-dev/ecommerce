package com.ecommerce.log.web.dto;

import java.util.List;

/** Page audit log (SF-13 A5) — page 1-based khớp convention admin khác. */
public record EventLogPageDto(List<EventLogItemDto> items, int page, int size, long total) {
}
