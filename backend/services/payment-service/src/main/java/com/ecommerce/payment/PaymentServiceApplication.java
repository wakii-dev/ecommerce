package com.ecommerce.payment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * payment-service — Stripe intents/webhook/refund qua adapter SPI (SF-5).
 *
 * <p>Conventions fork từ template (giữ nguyên): port 8086 · DB riêng
 * {@code db_payment} (D8) · scanBasePackages pickup common-lib outbox.
 * KHÔNG có Stripe key cũng BOOT OK (degraded mode — {@code spi.UnconfiguredAdapter}).</p>
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.payment.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class PaymentServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PaymentServiceApplication.class, args);
    }
}
