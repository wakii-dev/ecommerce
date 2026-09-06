package com.ecommerce.common.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ApiErrorTest {

    private final ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
        .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @Test
    void serializesRfc7807Fields() throws Exception {
        ApiError error = ApiError.of(400, "Validation failed", "Request body không hợp lệ",
            "/api/orders", "req-42",
            java.util.List.of(new ApiError.FieldViolation("email", "must not be blank")));

        String json = objectMapper.writeValueAsString(error);

        assertThat(json).contains("\"type\":\"about:blank\"");
        assertThat(json).contains("\"title\":\"Validation failed\"");
        assertThat(json).contains("\"status\":400");
        assertThat(json).contains("\"requestId\":\"req-42\"");
        assertThat(json).contains("\"field\":\"email\"");
        assertThat(json).contains("\"timestamp\":\"");
    }

    @Test
    void nullErrorsBecomeEmptyList() {
        ApiError error = ApiError.of(404, "Not found", "missing", null, null, null);
        assertThat(error.errors()).isEmpty();
    }
}
