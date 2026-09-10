package com.ecommerce.partner.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Config partner-api — URLs gọi trực tiếp service nội bộ (như ordering.pricing.*,
 * KHÔNG qua gateway) + webhook retry. GAP-1 interim: khi ordering có internal
 * order endpoint thì chỉ đổi config này (GAP-3 catalog by-id đã resolve —
 * public by-id endpoint, SF-4/FI-408).
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

    /** UUID-lookup đi public by-id (PUBLISHED-only — không cần token). */
    public record Catalog(String baseUrl, long timeoutMs) {
    }

    public record Webhook(long retryBaseMs, int maxAttempts, long schedulerIntervalMs) {
    }
}
