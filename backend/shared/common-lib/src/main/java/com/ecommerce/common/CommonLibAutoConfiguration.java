package com.ecommerce.common;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Auto-configuration của common-lib (đăng ký qua
 * {@code META-INF/spring/...AutoConfiguration.imports} — KHÔNG phụ thuộc
 * component-scan của service).
 *
 * <p>Component scan của service ({@code scanBasePackages = "com.ecommerce"})
 * pickup sẵn các @Component (GlobalExceptionHandler, OutboxRelay, OutboxWriter,
 * IdempotentConsumer). Phần KHÔNG tự pickup qua scan được wire ở đây:</p>
 * <ul>
 *   <li>{@code @EnableJpaRepositories} + {@code @EntityScan} cho package
 *       common-lib (repositories/entities không nằm trong package service).</li>
 *   <li>{@code @EnableScheduling} cho OutboxRelay poll.</li>
 * </ul>
 */
@AutoConfiguration(after = JpaRepositoriesAutoConfiguration.class)
@ConditionalOnClass(JpaRepository.class)
@Configuration
@EnableJpaRepositories(basePackages = "com.ecommerce.common")
@EntityScan(basePackages = "com.ecommerce.common")
@EnableScheduling
@EnableTransactionManagement
public class CommonLibAutoConfiguration {
}
