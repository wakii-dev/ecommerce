package com.ecommerce.affiliate;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.ecommerce.affiliate.config.AffiliateProperties;
import com.ecommerce.affiliate.loyalty.LoyaltyProperties;

/**
 * affiliate-service — affiliate module D20 (SF-12): registry + ref code +
 * track click (cookie attribution 30 ngày) + consume order.confirmed →
 * ledger hoa hồng.
 *
 * <p>Conventions fork từ template (giữ nguyên):</p>
 * <ul>
 *   <li>{@code scanBasePackages = "com.ecommerce"} — pickup common-lib
 *       (GlobalExceptionHandler, IdempotentConsumer, RequestIdMdcFilter).</li>
 *   <li>{@code @EntityScan} liệt kê TAY package entity của service + outbox của
 *       common-lib (Boot chỉ nhận MỘT {@code @EntityScan}).</li>
 *   <li>Port 8092 · DB riêng {@code db_affiliate} (D8).</li>
 *   <li>{@code @EnableScheduling} — relay tắt (service không publish) nhưng
 *       pattern giữ cho scheduler tương lai (payout, loyalty SF-14).</li>
 * </ul>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.affiliate.domain",
    "com.ecommerce.affiliate.loyalty.domain", // SF-14 (FI-324): loyalty slice D22
    "com.ecommerce.common.outbox"})
@EnableConfigurationProperties({AffiliateProperties.class, LoyaltyProperties.class}) // SF-14: loyalty D22
@EnableScheduling
public class AffiliateServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AffiliateServiceApplication.class, args);
    }
}
