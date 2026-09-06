package com.ecommerce.cart.config;

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
 * Security cart-service (SF-6) — "optional JWT" (khác catalog):
 *
 * <ul>
 *   <li>Guest: KHÔNG token — anonymous, permitAll (giỏ theo cookie
 *       {@code cart_token} httpOnly do server cấp, contract cart.yaml).</li>
 *   <li>User: Bearer JWT hợp lệ → resource-server decode → {@code sub} làm key
 *       giỏ {@code cart:user:{sub}}. Token CÓ MẶT nhưng sai/hết hạn → 401
 *       (fail-closed — không rơi về guest âm thầm, tránh cross-identity).</li>
 *   <li>{@code POST /api/cart/merge} — authenticated() bắt buộc (contract:
 *       security bearerAuth; guest → 401).</li>
 * </ul>
 *
 * <p>Quy tắc sắp matcher: matcher CỤ THỂ (merge) đặt TRƯỚC
 * {@code anyRequest().permitAll()} — thứ tự quyết định kết quả.</p>
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
                .requestMatchers(HttpMethod.POST, "/api/cart/merge").authenticated()
                .requestMatchers("/actuator/**", "/v3/api-docs/**", "/swagger-ui/**",
                    "/swagger-ui.html").permitAll()
                .anyRequest().permitAll())
            .oauth2ResourceServer(oauth -> oauth
                .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(jwtAuthenticationConverter)));
        return http.build();
    }
}
