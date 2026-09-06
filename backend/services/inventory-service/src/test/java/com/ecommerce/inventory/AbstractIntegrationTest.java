package com.ecommerce.inventory;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;

/**
 * IT harness base — MỌI integration test của service kế thừa class này.
 * Pattern: PG thật qua Testcontainers + datasource động; KHÔNG mock repository.
 *
 * <p><strong>Singleton container (static initializer, KHÔNG @Container):</strong>
 * Spring context cache tái sử dụng context giữa các test class — nếu container
 * per-class thì context của class sau trỏ vào container ĐÃ STOP (connection
 * refused, Hikari timeout 30s/test). Start 1 lần trong static block + Ryuk dọn
 * khi JVM exit → mọi class dùng chung container sống.</p>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_inventory")
        .withUsername("postgres")
        .withPassword("postgres")
        .withStartupTimeout(Duration.ofMinutes(3));

    static {
        POSTGRES.start();
    }

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
        // Tắt background sweep trong IT (1h) — test gọi sweeper.releaseExpired()
        // TRỰC TIẾP khi cần (deterministic; scheduler ngang test = flaky count).
        registry.add("inventory.reservation.sweep-interval-ms", () -> "3600000");
    }
}
