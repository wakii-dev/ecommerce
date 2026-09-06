package com.ecommerce.identity;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** Scaffold: context boot + Flyway tạo đúng 2 bảng + JWKS sẵn sàng. */
class IdentityScaffoldIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void flywayCreatedUsersAndRefreshTokens() {
        Integer users = jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = 'users'", Integer.class);
        Integer tokens = jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = 'refresh_tokens'", Integer.class);
        assertThat(users).isEqualTo(1);
        assertThat(tokens).isEqualTo(1);
    }

    @Test
    void jwksEndpointReturnsRsaKey() {
        org.springframework.test.web.reactive.server.WebTestClient client =
            org.springframework.test.web.reactive.server.WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + port).build();
        client.get().uri("/.well-known/jwks.json")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.keys[0].kty").isEqualTo("RSA")
            .jsonPath("$.keys[0].alg").isEqualTo("RS256")
            .jsonPath("$.keys[0].use").isEqualTo("sig")
            .jsonPath("$.keys[0].n").isNotEmpty()
            .jsonPath("$.keys[0].e").isNotEmpty();
    }
}
