package com.ecommerce.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Key từ `make keys` (infra/keys/ — make dev chạy từ backend/ nên default ../infra/...). */
@ConfigurationProperties(prefix = "identity.jwt")
public record JwtProperties(
    String privateKeyPath,
    String publicKeyPath,
    String kid,
    long accessTtlSeconds
) {}
