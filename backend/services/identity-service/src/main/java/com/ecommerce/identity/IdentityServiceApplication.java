package com.ecommerce.identity;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Fork từ template — giữ conventions fork (template javadoc pin):
 * scanBasePackages "com.ecommerce" (pickup common-lib components) +
 * EntityScan 2 package (Boot chỉ nhận MỘT @EntityScan).
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.identity", "com.ecommerce.common.outbox"})
@ConfigurationPropertiesScan
@EnableScheduling
public class IdentityServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(IdentityServiceApplication.class, args);
    }
}
