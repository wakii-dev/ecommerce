package com.ecommerce.log.web;

import com.ecommerce.log.domain.EventLogDocument;
import com.ecommerce.log.web.dto.EventLogItemDto;
import com.ecommerce.log.web.dto.EventLogPageDto;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Audit log viewer API (SF-13 A5) — GET /api/log/admin/events đọc Mongo
 * {@code event_log} (fan-in từ MỌI domain event — SF-10). Filter eventType +
 * from/to (ISO-8601 Instant, inclusive range), sort occurredAt DESC, paginate
 * page/50. Admin-only (SecurityConfig + gateway admin-prefixes — 2 lớp).
 */
@RestController
@RequestMapping("/api/log/admin")
public class AdminEventController {

    static final int PAGE_SIZE = 50;

    private final MongoTemplate mongo;

    public AdminEventController(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @GetMapping("/events")
    public EventLogPageDto events(
        @RequestParam(required = false) String eventType,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(defaultValue = "1") int page) {

        List<Criteria> parts = new ArrayList<>();
        if (eventType != null && !eventType.isBlank()) {
            parts.add(Criteria.where("eventType").is(eventType.trim()));
        }
        if (from != null && !from.isBlank()) {
            parts.add(Criteria.where("occurredAt").gte(parseInstant(from, "from")));
        }
        if (to != null && !to.isBlank()) {
            parts.add(Criteria.where("occurredAt").lte(parseInstant(to, "to")));
        }

        Query count = new Query();
        if (!parts.isEmpty()) {
            count.addCriteria(new Criteria().andOperator(parts.toArray(new Criteria[0])));
        }
        long total = mongo.count(count, EventLogDocument.class);

        Query query = count;
        query.with(Sort.by(Sort.Direction.DESC, "occurredAt"))
            .skip((long) (Math.max(page, 1) - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE);
        List<EventLogItemDto> items = mongo.find(query, EventLogDocument.class).stream()
            .map(AdminEventController::toDto)
            .toList();
        return new EventLogPageDto(items, Math.max(page, 1), PAGE_SIZE, total);
    }

    private static EventLogItemDto toDto(EventLogDocument doc) {
        Document payload = doc.getPayload();
        return new EventLogItemDto(doc.getId(), doc.getEventId(), doc.getEventType(),
            doc.getOccurredAt(), doc.getCorrelationId(), payload);
    }

    private static Instant parseInstant(String value, String param) {
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException e) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "Tham số '" + param + "' phải là ISO-8601 instant (vd 2026-09-07T00:00:00Z)");
        }
    }
}
