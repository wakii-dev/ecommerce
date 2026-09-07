package com.ecommerce.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Config notification-service (SF-10) — mail from + URLs gọi trực tiếp service
 * nội bộ (như partner-api: KHÔNG qua gateway). Service-account ADMIN dùng lấy
 * PDF hóa đơn từ ordering admin endpoint (GAP-1 interim — REQUIREMENT-GAP
 * FI-310; khi ordering có internal service-token endpoint thì đổi InvoiceClient).
 */
@ConfigurationProperties(prefix = "notify")
public record NotifyProperties(
    Mail mail,
    Identity identity,
    ServiceAccount serviceAccount,
    Ordering ordering
) {

    public record Mail(String from, String myOrdersUrl, String resetPasswordUrl) {
    }

    public record Identity(String baseUrl, long timeoutMs) {
    }

    /** Service-account lấy hóa đơn — role ADMIN do seed gán (SQL user_roles). */
    public record ServiceAccount(String email, String password, String fullName) {
    }

    public record Ordering(String baseUrl, long timeoutMs) {
    }
}
