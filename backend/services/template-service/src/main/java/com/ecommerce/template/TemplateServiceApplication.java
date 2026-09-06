package com.ecommerce.template;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Service template — nguồn copy-scaffold cho mọi service thật.
 *
 * <p>Conventions bắt buộc khi fork (SF-3+):</p>
 * <ul>
 *   <li>{@code scanBasePackages = "com.ecommerce"} — pickup common-lib
 *       (GlobalExceptionHandler, outbox relay/writer, idempotent consumer).</li>
 *   <li><strong>FORK — đổi package đầu tiên thành của mình, KHÔNG xóa
 *       {@code com.ecommerce.common}</strong>: Boot chỉ nhận MỘT
 *       {@code @EntityScan} nên phải liệt kê TAY cả 2 package (entity của
 *       service + entity outbox của common-lib).</li>
 *   <li>Port theo bảng trong {@code application.yml} — đổi ngay khi fork.</li>
 *   <li>DB riêng ({@code db_<service>}) — cấm share DB (D8).</li>
 * </ul>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.template", "com.ecommerce.common.outbox"})
@EnableScheduling
public class TemplateServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(TemplateServiceApplication.class, args);
    }
}
