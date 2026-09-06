package com.ecommerce.partner;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * partner-api (SF-11, D19) — Open API cho đối tác: X-API-Key auth + rate-limit,
 * /open-api/v1/** (catalog proxy + orders), webhook HMAC delivery, docs portal.
 *
 * <p>Conventions fork từ template (giữ nguyên):</p>
 * <ul>
 *   <li>{@code scanBasePackages = "com.ecommerce"} — pickup common-lib
 *       (GlobalExceptionHandler, IdempotentConsumer, RequestIdMdcFilter).</li>
 *   <li>{@code @EntityScan} liệt kê TAY package entity của service + outbox
 *       common-lib (Boot chỉ nhận MỘT {@code @EntityScan}).</li>
 *   <li>Port 8091 · DB riêng db_partner (D8) · KHÔNG JWT (auth là API key —
 *       gateway public-paths /open-api/** chủ đích, enforcement ở
 *       ApiKeyAuthFilter).</li>
 *   <li>{@code @EnableScheduling} — webhook retry scheduler.</li>
 * </ul>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.partner.domain", "com.ecommerce.common.outbox"})
@ConfigurationPropertiesScan
@EnableScheduling
public class PartnerApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(PartnerApiApplication.class, args);
    }
}
