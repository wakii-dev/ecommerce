package com.ecommerce.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.reactive.server.WebTestClient;

import static org.assertj.core.api.Assertions.assertThat;

/** Smoke: gateway boot + /api/smoke 200 + X-Request-Id có mặt (gen khi thiếu). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewaySmokeTest {

    @Autowired
    WebTestClient client;

    @Test
    void smokeRouteReturns200WithRequestId() {
        client.get().uri("/api/smoke")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().exists("X-Request-Id")
            .expectBody()
            .jsonPath("$.service").isEqualTo("gateway");
    }

    @Test
    void propagatesIncomingRequestId() {
        client.get().uri("/api/smoke")
            .header("X-Request-Id", "req-test-42")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().valueEquals("X-Request-Id", "req-test-42");
    }

    @Test
    void corsPreflightAllowsViteDevServer() {
        client.options().uri("/api/smoke")
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "GET")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:5173");
    }

    @Test
    void corsRejectsUnknownOrigin() {
        client.options().uri("/api/smoke")
            .header("Origin", "http://evil.example.com")
            .header("Access-Control-Request-Method", "GET")
            .exchange()
            .expectHeader().doesNotExist("Access-Control-Allow-Origin");
    }
}
