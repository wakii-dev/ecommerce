package com.ecommerce.catalog.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Admin guard (Task 8b) — API token-only, không session:
 *
 * <ul>
 *   <li>permitAll đọc public: GET products/categories/search (kèm PDP/suggest),
 *       actuator (health check compose/IT), swagger docs.</li>
 *   <li>{@code /api/catalog/admin/**} — MỌI method cần {@code ROLE_ADMIN}
 *       (path giữ full prefix — Conventions #11, gateway không StripPrefix).</li>
 *   <li>Còn lại → authenticated; không token → 401 fail-closed (mặc định
 *       BearerTokenAuthenticationEntryPoint), sai role → 403.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder jwtDecoder,
                                    JwtAuthenticationConverter jwtAuthenticationConverter) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable) // API token-only, không cookie session
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // HEAD match theo GET (security-audit P2-2): crawler/CDN probe HEAD → 401
                .requestMatchers(HttpMethod.HEAD,
                    "/api/catalog/products/**",
                    "/api/catalog/categories/**",
                    "/api/catalog/search/**").permitAll()
                .requestMatchers(HttpMethod.GET,
                    "/api/catalog/products/**",
                    "/api/catalog/categories/**",
                    "/api/catalog/search/**").permitAll()
                // SF-15 (FI-325): đăng ký "nhắn tôi khi có hàng" — public theo
                // contract; internal stock-alert paths do X-Internal-Token tự giữ
                // (auth là token trong service — KHÔNG permitAll mù quáng vì
                // /api/catalog/** public ở gateway).
                .requestMatchers(HttpMethod.POST, "/api/catalog/products/*/stock-alert").permitAll()
                .requestMatchers("/api/catalog/internal/**").permitAll()
                .requestMatchers(
                    "/actuator/**",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html").permitAll()
                .requestMatchers("/api/catalog/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth
                .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(jwtAuthenticationConverter)));
        return http.build();
    }
}
