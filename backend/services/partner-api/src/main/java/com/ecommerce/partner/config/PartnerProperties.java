package com.ecommerce.partner.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Config partner-api — URLs gọi trực tiếp service nội bộ (như ordering.pricing.*,
 * KHÔNG qua gateway) + webhook retry. GAP-1/GAP-3 interim: khi ordering có
 * internal order endpoint / catalog có public by-id thì chỉ đổi config này.
 */
@ConfigurationProperties(prefix = "partner")
public record PartnerProperties(
    Identity identity,
    ServiceAccount serviceAccount,
    Ordering ordering,
    Catalog catalog,
    Webhook webhook
) {

    public record Identity(String baseUrl, long timeoutMs) {
    }

    /** Service-account tạo đơn thay partner (GAP-1 interim — flag FI-310). */
    public record ServiceAccount(String email, String password, String fullName) {
    }

    public record Ordering(String baseUrl, long timeoutMs) {
    }

    /** adminToken rỗng → UUID detail trả 502 + nhắn "dùng slug" (GAP-3). */
    public record Catalog(String baseUrl, String adminToken, long timeoutMs) {
    }

    public record Webhook(long retryBaseMs, int maxAttempts, long schedulerIntervalMs) {
    }
}
