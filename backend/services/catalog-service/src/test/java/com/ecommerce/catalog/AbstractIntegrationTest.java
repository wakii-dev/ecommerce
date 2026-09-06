package com.ecommerce.catalog;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * IT harness base — MỌI integration test của catalog-service kế thừa class này.
 * Pattern copy từ template-service: PG thật qua Testcontainers + datasource
 * động; KHÔNG mock repository layer. Tag "integration" để lọc chạy.
 * (ES + Redis containers thêm ở IT cụ thể cần chúng — Task 5/6/7.)
 *
 * <p><strong>Container SINGLETON per JVM</strong> (không {@code @Container}):
 * Spring TestContext cache key KHÔNG tính giá trị {@code @DynamicPropertySource}
 * — các IT class cùng config sẽ DÙNG CHUNG 1 context với JDBC URL của container
 * class ĐẦU TIÊN; khi class đó stop container (@Container per-class), các class
 * sau chọc vào DB chết → Hikari timeout 30s/test. Start 1 lần trong static init
 * → mọi class chia sẻ container + context sống sót hết JVM (Ryuk dọn lúc exit).</p>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_catalog")
        .withUsername("postgres")
        .withPassword("postgres");

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
        // IT chỉ dựng PG — rabbit + redis health indicators (starter-amqp /
        // starter-data-redis) sẽ kéo health DOWN nếu không tắt; service thật
        // chạy cùng compose RabbitMQ/Redis nên không cần.
        registry.add("management.health.rabbit.enabled", () -> "false");
        registry.add("management.health.redis.enabled", () -> "false");
        // Tắt outbox relay poller trong IT — không có RabbitMQ, poll 2s/lần chỉ
        // gây ồn log + rỉ connection trên container PG dùng chung nhiều context.
        registry.add("outbox.relay.enabled", () -> "false");
    }
}
