package com.ecommerce.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * CORS dev — MFE Vite (5173 shell + remotes) + Next storefront (:3000, D16).
 * Profile `dev` only; prod gateway serve static same-origin (SF-10). Chi tiết
 * lựa chọn pattern xem ở {@link #corsWebFilter()}.
 */
@Configuration
@Profile("dev")
public class CorsConfig {

    /**
     * SF-6 (2026-09-06): thay DANH SÁCH TƯỜNG MINH bằng pattern port-wildcard —
     * danh sách cứ thối theo thời gian: SF-4 thêm Next :3000 vào route table
     * nhưng quên CORS → mọi POST từ PDP 403 (được che bằng toast fail-soft
     * "giỏ sẽ sớm khả dụng"); dev server auto-increment port khi đụng độ
     * (shell 5179, Next 3010 khi :3000 bị chiếm). {@code http://localhost:*}
     * là pattern HỢP LỆ của {@code OriginPattern} (wildcard `*` — khác regex
     * kiểu `517[3-9]` mà warning cũ cấm). Profile `dev` only; prod gateway
     * serve static same-origin (SF-10).
     */

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("http://localhost:*"));
        config.setAllowedMethods(List.of("*"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsWebFilter(source);
    }
}
