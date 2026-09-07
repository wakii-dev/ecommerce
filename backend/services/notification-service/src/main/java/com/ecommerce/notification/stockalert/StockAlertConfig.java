package com.ecommerce.notification.stockalert;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Đăng ký properties của slice SF-15 — KHÔNG đụng NotificationServiceApplication
 * (file SF-10): @Component + record KHÔNG kích hoạt constructor binding, phải
 * qua @EnableConfigurationProperties.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(StockAlertProperties.class)
public class StockAlertConfig {
}
