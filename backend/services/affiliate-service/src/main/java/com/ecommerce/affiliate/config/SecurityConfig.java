package com.ecommerce.affiliate.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Resource-server JWT RS256 (defense in depth §3.4 — gateway verify TRƯỚC,
 * service verify LẠI): decoder từ {@link JwtDecoderConfig} (JWKS remote hoặc
 * PEM local), authority ROLE_* cho admin guard.
 *
 * <p>Public theo contract affiliate.yaml: POST /api/affiliate/track/click
 * (storefront capture — KHÔNG auth). Controllers map FULL /api/affiliate/**
 * (precedent catalog/cart — gateway route KHÔNG StripPrefix).</p>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder jwtDecoder,
                                    JwtAuthenticationConverter jwtAuthenticationConverter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Public theo contract (không security trên operation này):
                .requestMatchers(
                    "/api/affiliate/track/click",
                    "/actuator/health/**", "/actuator/info",
                    "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                // Admin — 2 lớp: gateway admin-prefix + @PreAuthorize ở controller
                .requestMatchers("/api/affiliate/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o
                .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(jwtAuthenticationConverter)));
        return http.build();
    }
}

