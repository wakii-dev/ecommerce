package com.ecommerce.payment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Scaffold IT payment (plan T5 — mirror InventoryScaffoldTest): context loads +
 * Flyway V1+V10 + payment_intents đủ cột (stripe_status mirror). Boot với
 * WireMock base-url (StripeAdapter bean được tạo — key giả non-blank).
 */
class PaymentScaffoldTest extends AbstractPaymentIntegrationTest {

    @DynamicPropertySource
    static void stripe(DynamicPropertyRegistry registry) {
        registry.add("stripe.secret-key", () -> "sk_test_scaffold");
        registry.add("stripe.base-url", STRIPE_WIREMOCK::baseUrl);
        registry.add("stripe.webhook-secret", () -> "whsec_scaffold");
    }

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void contextLoadsWithFlywayMigrations() {
        Integer applied = jdbc.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE success = true", Integer.class);
        assertThat(applied).isGreaterThanOrEqualTo(2);
    }

    @Test
    void paymentIntentsTableHasMirrorStatusColumn() {
        jdbc.update("""
            INSERT INTO payment_intents (id, order_id, amount_vnd, currency, status,
                                         idempotency_key, payload_hash, stripe_status)
            VALUES (?::uuid, 'o-scaffold', 250000, 'VND', 'CREATED', 'key-scaffold', 'abc', 'requires_confirmation')
            """, java.util.UUID.randomUUID());
        String mirror = jdbc.queryForObject(
            "SELECT stripe_status FROM payment_intents WHERE idempotency_key = 'key-scaffold'", String.class);
        assertThat(mirror).isEqualTo("requires_confirmation");
        jdbc.update("DELETE FROM payment_intents WHERE idempotency_key = 'key-scaffold'");
    }
}
