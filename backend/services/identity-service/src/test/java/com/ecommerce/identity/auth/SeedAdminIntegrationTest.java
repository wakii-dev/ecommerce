package com.ecommerce.identity.auth;

import com.ecommerce.identity.AbstractIntegrationTest;
import com.ecommerce.identity.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Seed admin: context boot VỚI identity.seed.* (props per-class — class riêng)
 * → ApplicationRunner đã tạo admin role ADMIN lúc boot + login OK.
 * Idempotency: gọi seedAdmin.run(null) THÊM 2 lần → vẫn đúng 1 admin row.
 */
// CHÚ Ý: @SpringBootTest redeclare ở subclass SHADOW base annotation (không merge
// attribute) — phải khai báo LẠI webEnvironment, không chỉ properties.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "identity.seed.admin-email=admin@test.local",
    "identity.seed.admin-password=admin123"
})
class SeedAdminIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    SeedAdmin seedAdmin;

    @Autowired
    UserRepository userRepository;

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    @Test
    void adminSeededAtBoot_andLoginWorks() {
        assertThat(userRepository.existsByEmail("admin@test.local"))
            .as("ApplicationRunner phải đã seed admin lúc context boot").isTrue();
        Map<?, ?> body = client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"admin@test.local\",\"password\":\"admin123\"}")
            .exchange().expectStatus().isOk()
            .expectBody(Map.class).returnResult().getResponseBody();
        assertThat(((Map<?, ?>) body.get("user")).get("roles")).isEqualTo(List.of("ADMIN"));
    }

    @Test
    void runTwice_isIdempotent_singleAdminRow() {
        seedAdmin.run(null);
        seedAdmin.run(null);
        long admins = userRepository.findAll().stream()
            .filter(u -> "admin@test.local".equals(u.getEmail()))
            .count();
        assertThat(admins).as("existsByEmail branch phải skip — không tạo duplicate").isEqualTo(1);
    }
}
