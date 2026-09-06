package com.ecommerce.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * identity.seed.* — rỗng (default) = bỏ qua seed; chạy dev export ADMIN_EMAIL/
 * ADMIN_PASSWORD từ .env. KHÔNG hard-code secret vào yml.
 */
@ConfigurationProperties(prefix = "identity.seed")
public record SeedProperties(String adminEmail, String adminPassword) {}
