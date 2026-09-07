package com.ecommerce.notification;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.ecommerce.notification.config.NotifyProperties;

/**
 * notification-service (SF-10, port 8087, D18) — email cảm ơn khi đơn
 * CONFIRMED (attach PDF hóa đơn gọi nội bộ ordering admin invoice endpoint
 * bằng service-account ADMIN — pattern partner-api GAP-1 interim) + consume
 * order.cancelled / review.moderated (payload không có email → send-log
 * SKIPPED, không gọi lại HTTP vì fat-payload rule §6.1.5). SMTP dev = Mailpit
 * (compose SF-1, UI :8025). Send-log tại db_notification.
 */
@SpringBootApplication(scanBasePackages = "com.ecommerce")
@EntityScan({"com.ecommerce.notification", "com.ecommerce.common.outbox"})
@EnableConfigurationProperties(NotifyProperties.class)
@EnableScheduling
public class NotificationServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(NotificationServiceApplication.class, args);
    }
}
