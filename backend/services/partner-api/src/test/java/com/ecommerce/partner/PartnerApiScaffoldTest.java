package com.ecommerce.partner;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 1 — scaffold sống: context boot với PG+Rabbit thật, Flyway migrate
 * đủ V1 (outbox nền) + V10 (partner domain), actuator health UP.
 */
class PartnerApiScaffoldTest extends AbstractPartnerApiTest {

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void healthIsUp() {
        ResponseEntity<Map> response = rest.getForEntity("/actuator/health", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("status", "UP");
    }

    @Test
    void flywayMigratedPartnerDomain() {
        Integer v10 = jdbc.queryForObject(
            "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '10'", Integer.class);
        assertThat(v10).as("V10__partner_domain applied").isEqualTo(1);
        // 4 bảng domain tồn tại
        for (String table : new String[]{"partners", "api_keys", "partner_order_refs", "webhook_deliveries"}) {
            Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?", Integer.class, table);
            assertThat(cnt).as("table %s exists", table).isEqualTo(1);
        }
        // scopes là varchar[] (data_type=ARRAY, udt_name=_varchar)
        String dataType = jdbc.queryForObject(
            "SELECT data_type FROM information_schema.columns WHERE table_name='api_keys' AND column_name='scopes'",
            String.class);
        assertThat(dataType).isEqualTo("ARRAY");
    }
}
