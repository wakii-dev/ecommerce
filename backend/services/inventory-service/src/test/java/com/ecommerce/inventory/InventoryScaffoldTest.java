package com.ecommerce.inventory;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Scaffold IT (SF-5 T1): context loads + Flyway migrate + domain tables exist.
 * Domain migrations bắt đầu V10 (V1 = outbox nền common-lib).
 */
class InventoryScaffoldTest extends AbstractIntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void contextLoadsAndFlywayMigrated() {
        Integer applied = jdbc.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE success = true", Integer.class);
        assertThat(applied).as("V1 (outbox base) + V10 (domain) phải migrate xong").isGreaterThanOrEqualTo(2);
    }

    @Test
    void domainTablesExist() {
        Integer stocks = jdbc.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'stocks'", Integer.class);
        Integer reservations = jdbc.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'reservations'", Integer.class);
        assertThat(stocks).isEqualTo(1);
        assertThat(reservations).isEqualTo(1);
    }

    @Test
    void activeOrderUniqueIndexExists() {
        String indexDef = jdbc.queryForObject(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_reservations_active_order'", String.class);
        assertThat(indexDef)
            .as("partial unique index chống double-reserve phải tồn tại")
            .contains("UNIQUE")
            .contains("order_id")
            .contains("RESERVED");
    }

    @Test
    void stocksQuantityCheckConstraintRejectsNegative() {
        // CHECK (quantity >= 0) — nền tảng all-or-nothing: không bao giờ âm
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
            jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES ('neg-check', -1)")
        ).isInstanceOf(Exception.class);
    }
}
