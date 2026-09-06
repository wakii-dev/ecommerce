package com.ecommerce.template;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Smoke IT: service boot trên PG thật → health UP + Flyway V1 áp dụng
 * (bảng outbox/processed_messages tồn tại). Chạy: {@code mvn -pl services/template-service test}.
 */
class TemplateServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void bootsHealthyWithFlywayApplied() {
        // health endpoint
        ResponseEntity<Map> health = rest.getForEntity("/actuator/health", Map.class);
        assertThat(health.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(health.getBody()).containsEntry("status", "UP");

        // readiness probe
        ResponseEntity<Map> ready = rest.getForEntity("/actuator/health/readiness", Map.class);
        assertThat(ready.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Flyway V1 → bảng nền tồn tại
        Integer flywayRows = jdbc.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE version = '1'", Integer.class);
        assertThat(flywayRows).isEqualTo(1);

        Integer outboxRows = jdbc.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'outbox'", Integer.class);
        Integer processedRows = jdbc.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'processed_messages'", Integer.class);
        assertThat(outboxRows).isEqualTo(1);
        assertThat(processedRows).isEqualTo(1);
    }
}
