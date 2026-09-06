package com.ecommerce.payment;

import com.github.tomakehurst.wiremock.WireMockServer;
import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Duration;

import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;

/**
 * IT harness payment-service — singleton PG container (static start, Ryuk dọn):
 * context cache giữa các test class cần container SỐNG (per-class @Container =
 * connection refused ở class sau). Singleton WireMock làm Stripe double —
 * class con inject `stripe.base-url` qua @DynamicPropertySource của mình
 * (degraded class override `stripe.secret-key` thành "").
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractPaymentIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse("postgres:16"))
        .withDatabaseName("db_payment")
        .withUsername("postgres")
        .withPassword("postgres")
        .withStartupTimeout(Duration.ofMinutes(3));

    static final WireMockServer STRIPE_WIREMOCK = new WireMockServer(options().dynamicPort());

    static {
        POSTGRES.start();
        STRIPE_WIREMOCK.start();
    }

    @LocalServerPort
    int port;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("management.health.rabbit.enabled", () -> "false");
    }
}
