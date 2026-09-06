package com.ecommerce.partner;

import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * IT harness partner-api (SF-11) — 1 PG + 1 RabbitMQ thật, container STATIC
 * singleton (start 1 lần/JVM — bài học @Container per-class chết ở class 2).
 * Flyway CHẠY thật trong IT (jar riêng, không conflict V10 như saga IT).
 *
 * <p>Services ngoài (identity / ordering / catalog) = WireMock doubles do
 * từng test tự cấu hình (base url ghi qua property {@code partner.*});
 * webhook receiver cũng là WireMock — Task 4/5 thêm khi cần.</p>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractPartnerApiTest {

    static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>(DockerImageName.parse("postgres:16"))
            .withDatabaseName("db_partner")
            .withUsername("postgres")
            .withPassword("postgres");

    static final RabbitMQContainer RABBIT =
        new RabbitMQContainer(DockerImageName.parse("rabbitmq:3-management"));

    static {
        POSTGRES.start();
        RABBIT.start();
    }

    @LocalServerPort
    int port;

    @Autowired
    protected TestRestTemplate rest;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", () -> RABBIT.getMappedPort(5672));
        // Retry/scheduler nhanh cho IT (override ở test riêng khi cần chậm hơn)
        registry.add("partner.webhook.retry-base-ms", () -> "100");
        registry.add("partner.webhook.scheduler-interval-ms", () -> "200");
    }
}
