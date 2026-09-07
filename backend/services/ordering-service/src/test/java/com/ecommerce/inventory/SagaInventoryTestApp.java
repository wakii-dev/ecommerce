package com.ecommerce.inventory;

import org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration;
import org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * App inventory CHO RIÊNG saga IT (lý-do hẹp scan xem SagaOrderingTestApp):
 * đặt tại package com.ecommerce.inventory để @SpringBootApplication quét
 * repositories mặc định đúng package này. Flyway TẮT trong IT.
 *
 * <p>Scan liệt kê TỪNG sub-package CHỨC NĂNG, KHÔNG quét root
 * {@code com.ecommerce.inventory}: root chứa {@link InventoryServiceApplication}
 * (@SpringBootApplication scanBasePackages="com.ecommerce") — nếu bị nhặt làm
 * candidate thì scan rộng của nó parse đệ quy → quét MỌI module trên test
 * classpath → 2 class RabbitMqConfig trùng bean name 'rabbitMqConfig'
 * (ConflictingBeanDefinitionException). Spring 6.1 ConfigurationClassParser
 * parse đệ quy candidate (@ComponentScan → parse scanned candidates).</p>
 *
 * <p>Security EXCLUDE: test classpath merged của module ordering mang
 * spring-boot-starter-security — boot context inventory ở đây thì
 * SecurityAutoConfiguration bật default chain (mọi request cần auth) →
 * ordering gọi POST /inventory/reservations bị 401. Inventory/payment KHÔNG
 * có security riêng (service-to-service mở — gateway wire service-token là
 * việc sau), nên tắt hẳn autoconfig.</p>
 */
@SpringBootApplication(scanBasePackages = {
    "com.ecommerce.inventory.api", "com.ecommerce.inventory.config",
    "com.ecommerce.inventory.consumer", "com.ecommerce.inventory.service",
    "com.ecommerce.common"},
    exclude = {SecurityAutoConfiguration.class, SecurityFilterAutoConfiguration.class,
        UserDetailsServiceAutoConfiguration.class, ManagementWebSecurityAutoConfiguration.class,
        OAuth2ResourceServerAutoConfiguration.class})
@EntityScan({"com.ecommerce.inventory.domain", "com.ecommerce.common.outbox"})
@EnableScheduling
public class SagaInventoryTestApp {
}
