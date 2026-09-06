package com.ecommerce.catalog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * catalog-service (SF-4, port 8082) — products/categories/i18n JSONB, search
 * ES chính + PgFts fallback, Redis cache (D14/D15/D17).
 *
 * <p>Fork từ template-service — conventions giữ nguyên:</p>
 * <ul>
 *   <li>{@code scanBasePackages = "com.ecommerce"} — pickup common-lib
 *       (GlobalExceptionHandler, outbox relay/writer, idempotent consumer).</li>
 *   <li><strong>DUAL {@code @EntityScan}</strong>: Boot chỉ nhận MỘT
 *       {@code @EntityScan} nên phải liệt kê TAY cả 2 package (entity của
 *       service + entity outbox của common-lib) — mất package common =
 *       outbox repos chết im lặng.</li>
 *   <li>DB riêng {@code db_catalog} (D8) — host port 5433.</li>
 * </ul>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.catalog", "com.ecommerce.common.outbox"})
@EnableScheduling
public class CatalogServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(CatalogServiceApplication.class, args);
    }
}
