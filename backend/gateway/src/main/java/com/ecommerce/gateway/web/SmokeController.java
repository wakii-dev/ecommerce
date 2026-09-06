package com.ecommerce.gateway.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * Handler NỘI BỘ cho smoke route — path /internal/** để KHÔNG đụng RoutePredicate
 * (RequestMappingHandlerMapping order 0 thắng RoutePredicateHandlerMapping order 1:
 * nếu controller map trùng path client, request không bao giờ qua gateway chain).
 * Client gọi /api/smoke → route 'smoke' (gateway-routes.yml) → global filter
 * (X-Request-Id) → ForwardRoutingFilter → handler này.
 */
@RestController
public class SmokeController {

    @GetMapping("/internal/smoke")
    public Map<String, Object> smoke() {
        return Map.of(
            "status", "ok",
            "service", "gateway",
            "at", Instant.now().toString()
        );
    }
}
