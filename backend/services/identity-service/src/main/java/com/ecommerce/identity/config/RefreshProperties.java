package com.ecommerce.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** identity.refresh.* — TTL refresh + Path của cookie BROWSER (qua gateway). */
@ConfigurationProperties(prefix = "identity.refresh")
public record RefreshProperties(int ttlDays, String cookiePath) {}
