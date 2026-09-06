package com.ecommerce.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * CORS dev — 7 Vite server MFE (5173 shell + 5174-5179 remotes).
 * DANH SÁCH TƯỜNG MINH, KHÔNG dùng regex kiểu `517[3-9]`: Spring
 * {@code OriginPattern} chỉ hiểu wildcard `*` (phần còn lại được \Q..\E
 * quote thành literal) — `[3-9]` sẽ từ chối TẤT CẢ origin.
 * Profile `dev` only; prod gateway serve static same-origin (SF-10).
 */
@Configuration
@Profile("dev")
public class CorsConfig {

    static final List<String> ALLOWED_ORIGINS = List.of(
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179"
    );

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(ALLOWED_ORIGINS);
        config.setAllowedMethods(List.of("*"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsWebFilter(source);
    }
}
