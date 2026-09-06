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
                props.publicPaths().forEach(path -> exchange.pathMatchers(path).permitAll());
                props.adminPrefixes().forEach(path -> exchange.pathMatchers(path).hasRole("ADMIN"));
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
