package com.ecommerce.notification.stockalert;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Config file-slice stock alert (SF-15) — tách khỏi NotifyProperties (SF-10)
 * để không đụng file slice người khác. enabled=false → scheduler no-op.
 * (Binding qua StockAlertConfig — @EnableConfigurationProperties.)
 */
@ConfigurationProperties(prefix = "notify.stock-alert")
public record StockAlertProperties(
    boolean enabled,
    Catalog catalog,
    String storefrontUrl
) {

    public StockAlertProperties {
        if (storefrontUrl == null || storefrontUrl.isBlank()) storefrontUrl = "http://localhost:3000";
    }

    public record Catalog(String baseUrl, String internalToken, long timeoutMs) {
        public Catalog {
            if (timeoutMs <= 0) timeoutMs = 3000;
        }
    }
}
