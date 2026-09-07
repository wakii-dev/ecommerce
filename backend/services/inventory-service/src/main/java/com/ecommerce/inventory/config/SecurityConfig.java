package com.ecommerce.inventory.config;

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
 * Inventory guard (FI-366 SF-1 T10 — "guard tối giản", audit E7: RBAC hở).
 * Service nhận path ĐÃ strip /api (gateway inventory route StripPrefix=1) →
 * matchers dùng path service-side {@code /inventory/...}.
 *
 * <ul>
 *   <li>{@code /inventory/admin/**} — cần {@code ROLE_ADMIN} (low-stock dashboard).
 *       Trước đây không có guard gì: customer JWT qua gateway ăn 200 data tồn kho.</li>
 *   <li>GET/HEAD {@code /inventory/availability} — permitAll (guest PDP badge +
 *       form stock-alert, gateway public-path).</li>
 *   <li>{@code /inventory/reservations/**} — permitAll CÓ CHỦ ĐÍCH: ordering saga
 *       gọi thẳng :8084 KHÔNG kèm auth (InventoryClient — không header). Chặn sẽ
 *       vỡ checkout; internal-token theo precedent SF-15 catalog là follow-up
 *       (đăng ký bug register P2 — cần đổi CẢ ordering client + inventory).</li>
 *   <li>actuator/swagger permitAll; còn lại authenticated (fail-closed).</li>
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
                // HEAD match theo GET (catalog security-audit P2-2): crawler probe HEAD → 401
                .requestMatchers(HttpMethod.HEAD, "/inventory/availability").permitAll()
                .requestMatchers(HttpMethod.GET, "/inventory/availability").permitAll()
                // Saga service-to-service (ordering → :8084, không header) — xem javadoc
                .requestMatchers("/inventory/reservations/**").permitAll()
                .requestMatchers(
                    "/actuator/**",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html").permitAll()
                .requestMatchers("/inventory/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth
                .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(jwtAuthenticationConverter)));
        return http.build();
    }
}
