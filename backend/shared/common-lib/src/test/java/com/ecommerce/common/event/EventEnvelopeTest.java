package com.ecommerce.common.event;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class EventEnvelopeTest {

    private final ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
        .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @Test
    void serializesAndDeserializesRoundTrip() throws Exception {
        JsonNode payload = objectMapper.readTree("{\"order_id\":\"o-1\",\"total\":123000}");
        EventEnvelope envelope = new EventEnvelope(
            java.util.UUID.fromString("00000000-0000-0000-0000-000000000001"),
            "order.confirmed", Instant.parse("2026-09-06T00:00:00Z"), "req-123", "ordering-service", 1, payload);

        String json = objectMapper.writeValueAsString(envelope);
        EventEnvelope back = objectMapper.readValue(json, EventEnvelope.class);

        assertThat(back.eventId()).isEqualTo(envelope.eventId());
        assertThat(back.eventType()).isEqualTo("order.confirmed");
        assertThat(back.correlationId()).isEqualTo("req-123");
        assertThat(back.occurredAt()).isEqualTo(Instant.parse("2026-09-06T00:00:00Z"));
        assertThat(back.producer()).isEqualTo("ordering-service");
        assertThat(back.schemaVersion()).isEqualTo(1);
        assertThat(back.payload().path("total").asInt()).isEqualTo(123000);
    }

    @Test
    void ofGeneratesIdAndTimestamp() {
        JsonNode payload = objectMapper.createObjectNode().put("k", "v");
        EventEnvelope envelope = EventEnvelope.of("identity-service", "user.created", "req-1", payload);

        assertThat(envelope.eventId()).isNotNull();
        assertThat(envelope.occurredAt()).isNotNull();
        assertThat(envelope.producer()).isEqualTo("identity-service");
        assertThat(envelope.schemaVersion())
            .as("schemaVersion khớp freeze envelope.schema.json (minimum 1)").isEqualTo(1);
        assertThat(envelope.payload().path("k").asText()).isEqualTo("v");
    }

    @Test
    void threeArgFactoryDefaultsProducerToUnknown() {
        JsonNode payload = objectMapper.createObjectNode().put("k", "v");
        EventEnvelope envelope = EventEnvelope.of("product.changed", "req-1", payload);

        assertThat(envelope.producer()).isEqualTo("unknown");
        assertThat(envelope.schemaVersion()).isEqualTo(EventEnvelope.CURRENT_SCHEMA_VERSION);
    }
}
