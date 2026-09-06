package com.ecommerce.inventory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * inventory-service — stock + reservation variant-level (SF-5).
 *
 * <p>Conventions fork từ template (giữ nguyên):</p>
 * <ul>
 *   <li>{@code scanBasePackages = "com.ecommerce"} — pickup common-lib
 *       (GlobalExceptionHandler, outbox relay/writer, idempotent consumer).</li>
 *   <li>{@code @EntityScan} liệt kê TAY package entity của service + outbox của
 *       common-lib (Boot chỉ nhận MỘT {@code @EntityScan}).</li>
 *   <li>Port 8084 · DB riêng {@code db_inventory} (D8).</li>
 * </ul>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.inventory.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class InventoryServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(InventoryServiceApplication.class, args);
    }
}
