package com.ecommerce.common;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.context.annotation.Bean;
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
 * IdempotentConsumer, RequestIdMdcFilter). Wire ở đây:</p>
 * <ul>
 *   <li>{@code @EnableJpaRepositories} cho package common-lib (repositories
 *       không nằm trong package service).</li>
 *   <li>{@code @EnableScheduling} cho OutboxRelay poll.</li>
 *   <li>Topic exchange {@code ecommerce.events} (durable) — declare 1 lần duy nhất
 *       ở nền, SF sau không tự declare.</li>
 * </ul>
 *
 * <p><strong>KHÔNG {@code @EntityScan} ở đây:</strong> Boot chỉ chấp nhận MỘT
 * {@code @EntityScan} — đặt ở đây sẽ override entity scanning của service fork
 * ("Not a managed type"). Service fork tự khai:
 * {@code @EntityScan({"com.ecommerce.<svc>.domain", "com.ecommerce.common.outbox"})}
 * (template đã dạy sẵn pattern).</p>
 */
@AutoConfiguration(after = JpaRepositoriesAutoConfiguration.class)
@ConditionalOnClass(JpaRepository.class)
@Configuration
@EnableJpaRepositories(basePackages = "com.ecommerce.common")
@EnableScheduling
@EnableTransactionManagement
public class CommonLibAutoConfiguration {

    /**
     * AMQP wiring — chỉ bật khi service có rabbit trên classpath.
     * Gateway (reactive) và service không MQ không bị ép thêm dependency.
     */
    @Configuration
    @ConditionalOnClass(RabbitTemplate.class)
    static class OutboxAmqpConfiguration {

        @Bean
        @ConditionalOnMissingBean(TopicExchange.class)
        TopicExchange outboxEventsExchange(
            @Value("${outbox.relay.exchange:ecommerce.events}") String exchange) {
            return new TopicExchange(exchange, true, false);
        }
    }
}
