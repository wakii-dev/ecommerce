package com.ecommerce.template;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Service template — nguồn copy-scaffold cho mọi service thật.
 *
 * <p>Conventions bắt buộc khi fork (SF-3+):</p>
 * <ul>
 *   <li>{@code scanBasePackages = "com.ecommerce"} — pickup common-lib
 *       (GlobalExceptionHandler, outbox, idempotent consumer).</li>
 *   <li>{@code @EnableScheduling} — OutboxRelay poll (tắt per-service bằng
 *       {@code outbox.relay.enabled=false} nếu không publish event).</li>
 *   <li>Port theo bảng trong {@code application.yml} — đổi ngay khi fork.</li>
 *   <li>DB riêng ({@code db_<service>}) — cấm share DB (D8).</li>
 * </ul>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EnableScheduling
public class TemplateServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(TemplateServiceApplication.class, args);
    }
}
