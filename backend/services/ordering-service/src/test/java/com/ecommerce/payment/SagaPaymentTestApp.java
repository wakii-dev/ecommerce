package com.ecommerce.payment;

import org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration;
import org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * App payment CHO RIÊNG saga IT (lý-do hẹp scan xem SagaOrderingTestApp):
 * đặt tại package com.ecommerce.payment để repository scan mặc định đúng.
 * Flyway TẮT trong IT.
 *
 * <p>Scan TỪNG sub-package (KHÔNG root) — root chứa
 * {@link PaymentServiceApplication} scanBasePackages="com.ecommerce"; bị nhặt
 * làm candidate thì parse đệ quy quét MỌI module → trùng bean name
 * 'rabbitMqConfig'. spi KHÔNG có @Component (adapter wire qua
 * PaymentAdapterConfig @Bean) — không cần quét.</p>
 *
 * <p>Security EXCLUDE (lý-do đầy đủ xem SagaInventoryTestApp): test classpath
 * merged của ordering mang starter-security → default chain chặn webhook
 * POST /payment/webhook 401.</p>
 */
@SpringBootApplication(scanBasePackages = {
    "com.ecommerce.payment.api", "com.ecommerce.payment.config",
    "com.ecommerce.payment.service", "com.ecommerce.common"},
    exclude = {SecurityAutoConfiguration.class, SecurityFilterAutoConfiguration.class,
        UserDetailsServiceAutoConfiguration.class, ManagementWebSecurityAutoConfiguration.class,
        OAuth2ResourceServerAutoConfiguration.class})
@EntityScan({"com.ecommerce.payment.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class SagaPaymentTestApp {
}
