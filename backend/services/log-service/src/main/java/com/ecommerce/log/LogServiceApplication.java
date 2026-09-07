package com.ecommerce.log;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * log-service (SF-10, port 8088, D14) — audit trail demo: consumer fan-in
 * MỌI domain events (queue {@code log.events} bind {@code #} trên topic
 * exchange {@code ecommerce.events}) → ghi document Mongo
 * {@code db_log.event_log}. Idempotent theo eventId (unique index —
 * DuplicateKey = re-delivery, ack bỏ qua). KHÔNG REST write API — đọc qua
 * mongo-express :8089.
 *
 * <p>DEVIATION pattern fork: KHÔNG {@code @EntityScan} + KHÔNG
 * {@code @EnableScheduling} (không JPA, không outbox relay — service chỉ
 * consume). common-lib exclude starter-data-jpa → auto-config backs off →
 * exchange tự declare (RabbitMqConfig, như cart-service SF-10).</p>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce.log")
public class LogServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(LogServiceApplication.class, args);
    }
}
