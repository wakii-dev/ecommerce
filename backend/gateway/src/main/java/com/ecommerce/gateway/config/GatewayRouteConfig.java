package com.ecommerce.gateway.config;

import org.springframework.cloud.gateway.filter.FilterDefinition;
import org.springframework.cloud.gateway.handler.predicate.PredicateDefinition;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import reactor.core.publisher.Flux;

import java.net.URI;
import java.util.List;

/**
 * Route identity — SF-3 (FI-313).
 * KHÔNG dùng routes/&lt;svc&gt;.yml (config.import): `spring.cloud.gateway.routes`
 * là list — file thứ 2 import sẽ ĐÈ route smoke của gateway-routes.yml hoặc
 * bind fail (list không merge giữa các config source). RouteDefinitionLocator
 * bean được CompositeRouteDefinitionLocator GỘP với route từ properties —
 * gateway-routes.yml (SF-1) giữ nguyên.
 * CONVENTION SF sau: thêm bean tương tự cho service mình (SF-4 catalog :8082...).
 * Giữ StripPrefix=2 — service nhận path SAU /api/&lt;svc&gt; (springdoc/actuator
 * của service sống ở root).
 */
@Configuration
public class GatewayRouteConfig {

    @Bean
    RouteDefinitionLocator identityRouteDefinitionLocator(Environment environment) {
        RouteDefinition route = new RouteDefinition();
        route.setId("identity");
        route.setUri(URI.create(environment.resolvePlaceholders("${IDENTITY_URI:http://localhost:8081}")));
        route.setPredicates(List.of(new PredicateDefinition("Path=/api/identity/**")));
        route.setFilters(List.of(new FilterDefinition("StripPrefix=2")));
        return () -> Flux.just(route);
    }
}
