package com.ecommerce.ordering.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Resource-server JWT RS256 (defense in depth §3.4 — gateway verify TRƯỚC,
 * service verify LẠI): JWKS identity qua gateway, claim {@code role} →
 * ROLE_* (khớp GatewaySecurityConfig/identity SecurityConfig).
 *
 * <p>Paths bên DƯỚI là paths SAU StripPrefix=1 của gateway (controller không
 * mang prefix /api/ordering — convention gateway-routes.yml cho ordering).</p>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    JwtDecoder jwtDecoder(@Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}") String jwkSetUri) {
        return NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder jwtDecoder) throws Exception {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");   // claim `role` → ROLE_<giá trị>
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);

        http.csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Public theo contract (không security trên operation này):
                .requestMatchers(
                    "/orders/validate-coupon",
                    "/coupons/public",
                    "/shipping/methods",
                    "/actuator/health/**", "/actuator/info",
                    "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                // Admin — 2 lớp: gateway admin-prefix + @PreAuthorize ở controller
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)));
        return http.build();
    }
}
