package com.ecommerce.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/** Policy auth gateway — giá trị từ routes/gateway-auth.yml (SF-3 tập trung 1 file). */
@ConfigurationProperties(prefix = "ecom.gateway.auth")
public record GatewayAuthProperties(String jwksUri, List<String> publicPaths, List<String> adminPrefixes) {}
