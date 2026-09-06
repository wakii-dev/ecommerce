package com.ecommerce.partner.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Security chain partner-api — auth là X-API-Key (filter riêng, Task 2).
 * Chain này permitAll để filter tự quyết định 401/403/429 theo key; các path
 * nền tảng (actuator/docs) exempt hẳn.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(
                org.springframework.security.config.http.SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }

    /**
     * Noop — tắt user mặc định starter-security (không ai login được; auth
     * thật là API key). Có bean này → UserDetailsServiceAutoConfiguration skip.
     */
    @Bean
    UserDetailsService noopUserDetailsService() {
        return username -> {
            throw new UsernameNotFoundException("partner-api: API-key auth only");
        };
    }
}
