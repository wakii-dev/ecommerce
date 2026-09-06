package com.ecommerce.ordering;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * ordering-service — checkout saga orchestrator + coupons + invoice SPI (SF-9).
 *
 * <p>Conventions fork từ template (giữ nguyên):</p>
 * <ul>
 *   <li>{@code scanBasePackages = "com.ecommerce"} — pickup common-lib
 *       (GlobalExceptionHandler, outbox relay/writer, idempotent consumer).</li>
 *   <li>{@code @EntityScan} liệt kê TAY package entity của service + outbox của
 *       common-lib (Boot chỉ nhận MỘT {@code @EntityScan}).</li>
 *   <li>Port 8085 · DB riêng {@code db_ordering} (D8).</li>
 *   <li>{@code @EnableScheduling} — outbox relay + TTL-cancel sweeper (35').</li>
 * </ul>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.ordering.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class OrderingServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderingServiceApplication.class, args);
    }
}
