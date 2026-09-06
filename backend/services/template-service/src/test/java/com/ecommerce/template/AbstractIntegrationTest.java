package com.ecommerce.template;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * IT harness base — MỌI integration test của service kế thừa class này.
 * Pattern (SF-3+ copy y nguyên): PG thật qua Testcontainers + datasource
 * động; KHÔNG mock repository layer. Tag "integration" để lọc chạy.
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_template")
        .withUsername("postgres")
        .withPassword("postgres");

    @LocalServerPort
    int port;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // IT chỉ dựng PG — rabbit health indicator (starter-amqp) sẽ kéo health
        // DOWN nếu không tắt; service thật chạy cùng compose RabbitMQ nên không cần.
        registry.add("management.health.rabbit.enabled", () -> "false");
    }
}
