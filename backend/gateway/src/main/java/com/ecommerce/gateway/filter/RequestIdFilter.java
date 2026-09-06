package com.ecommerce.gateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.UUID;

/**
 * Gen/propagate {@code X-Request-Id}: client gửi → giữ nguyên; không → gen UUID.
 * ID đi: (1) header request forward xuống service, (2) header response về client,
 * (3) MDC logs của gateway. Services propagate tiếp vào outbox events
 * (correlationId) — trace end-to-end HTTP → MQ (spec §3.3).
 */
@Component
public class RequestIdFilter implements GlobalFilter, Ordered {

    public static final String HEADER = "X-Request-Id";
    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String requestId = firstHeader(exchange) != null
            ? firstHeader(exchange)
            : UUID.randomUUID().toString();

        ServerHttpRequest mutated = exchange.getRequest().mutate()
            .header(HEADER, requestId)
            .build();

        // Response header set TRƯỚC khi commit — mọi kiểu response đều mang được
        exchange.getResponse().beforeCommit(() -> {
            if (!exchange.getResponse().getHeaders().containsKey(HEADER)) {
                exchange.getResponse().getHeaders().set(HEADER, requestId);
            }
            return Mono.empty();
        });

        MDC.put("requestId", requestId);
        log.debug("{} {} -> {}", exchange.getRequest().getMethod(),
            exchange.getRequest().getPath(), requestId);
        return chain.filter(exchange.mutate().request(mutated).build())
            .doFinally(signal -> MDC.remove("requestId"));
    }

    private String firstHeader(ServerWebExchange exchange) {
        List<String> values = exchange.getRequest().getHeaders().get(HEADER);
        return (values == null || values.isEmpty() || values.get(0).isBlank())
            ? null
            : values.get(0);
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
