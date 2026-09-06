package com.ecommerce.catalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT Flyway — V1 (nền outbox dùng chung) + V10 (domain catalog) phải migrate
 * sạch trên PG 16 thật: extensions + f_unaccent + 4 tables + generated column
 * + GIN indexes. Context boot full (RANDOM_PORT) → ddl-auto validate cũng xác
 * nhận entity mapping khớp schema.
 *
 * <p>Tên {@code *Test} (không phải {@code *IT}) — repo KHÔNG có failsafe
 * plugin; IT chạy qua surefire theo pattern {@code **\/*Test.java} như
 * template {@code TemplateServiceIntegrationTest}.</p>
 */
class CatalogFlywayMigrationTest extends AbstractIntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    private int tableCount(String name) {
        return jdbc.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = ?", Integer.class, name);
    }

    @Test
    void v1NenOutboxMigrateSach() {
        // OutboxRelay/IdempotentConsumer (common-lib) cần 2 bảng nền này — KHÔNG được mất khi fork
        assertThat(tableCount("outbox")).isEqualTo(1);
        assertThat(tableCount("processed_messages")).isEqualTo(1);
    }

    @Test
    void v10DomainTablesMigrateSach() {
        assertThat(tableCount("categories")).isEqualTo(1);
        assertThat(tableCount("products")).isEqualTo(1);
        assertThat(tableCount("product_images")).isEqualTo(1);
        assertThat(tableCount("product_variants")).isEqualTo(1);
    }

    @Test
    void v10ExtensionsVaFUnaccentTonTai() {
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM pg_extension WHERE extname = 'unaccent'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM pg_proc WHERE proname = 'f_unaccent'", Integer.class)).isEqualTo(1);
        // wrapper hoạt động thật — bỏ dấu
        assertThat(jdbc.queryForObject(
            "SELECT f_unaccent('Điện Thoại')", String.class)).isEqualTo("Dien Thoai");
    }

    @Test
    void v10SearchVecGeneratedColumnVaIndexes() {
        assertThat(jdbc.queryForObject("""
            SELECT count(*) FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'search_vec'
            """, Integer.class)).isEqualTo(1);
        // GIN tsvector + GIN trgm trên name->>'vi'
        assertThat(jdbc.queryForObject("""
            SELECT count(*) FROM pg_indexes
            WHERE tablename = 'products' AND indexdef LIKE '%USING gin%'
            """, Integer.class)).isEqualTo(2);
    }
}
