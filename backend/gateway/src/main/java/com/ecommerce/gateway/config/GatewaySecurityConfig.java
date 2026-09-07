package com.ecommerce.gateway.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverter;
import org.springframework.security.web.server.SecurityWebFilterChain;
import reactor.core.publisher.Flux;

/**
 * JWT RS256 qua JWKS identity + public-paths + admin guard (401/403 server-side).
 * Authorization chạy TRƯỚC route dispatch — /api/admin/** chưa route vẫn 403
 * khi thiếu role (spec §4.3, ACCEPTANCE 3).
 */
@Configuration
@EnableWebFluxSecurity
@EnableConfigurationProperties(GatewayAuthProperties.class)
public class GatewaySecurityConfig {

    @Bean
    SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http,
                                                     GatewayAuthProperties props,
                                                     ReactiveJwtDecoder jwtDecoder) {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");   // claim `role` → ROLE_<giá trị>
        authorities.setAuthorityPrefix("ROLE_");
        ReactiveJwtAuthenticationConverter converter = new ReactiveJwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt ->
            Flux.fromIterable(authorities.convert(jwt)));

        http.csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchange -> {
                // FI-366 SF-1 (T10): admin-prefixes ĐĂNG KÝ TRƯỚC public-paths —
                // authorizeExchange first-match-wins theo thứ tự; /api/catalog/admin/**
                // match cả 2 rule và public '/api/catalog/**' (guest browse) đăng ký
                // trước sẽ NUỐT request admin → permitAll (phá guard). Admin-wins là
                // defense-in-depth đúng: path trùng public+admin phải qua role check.
                props.adminPrefixes().forEach(path -> exchange.pathMatchers(path).hasRole("ADMIN"));
                props.publicPaths().forEach(path -> exchange.pathMatchers(path).permitAll());
                exchange.pathMatchers("/api/**").authenticated();
                exchange.anyExchange().permitAll();
            })
            .oauth2ResourceServer(o -> o.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)));
        return http.build();
    }

    @Bean
    ReactiveJwtDecoder jwtDecoder(GatewayAuthProperties props) {
        return NimbusReactiveJwtDecoder.withJwkSetUri(props.jwksUri()).build();
    }
}
