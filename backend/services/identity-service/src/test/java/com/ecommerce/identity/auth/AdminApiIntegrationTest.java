package com.ecommerce.identity.auth;

import com.ecommerce.identity.AbstractIntegrationTest;
import com.ecommerce.identity.user.Role;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * RBAC service-layer: customer → /admin/users 403; admin → 200 {items,page,size,total};
 * ?q= lọc theo email/fullName; pagination tôn trọng size (prefix q độc lập giữa test).
 */
class AdminApiIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    UserRepository userRepository;

    @Autowired
    PasswordEncoder passwordEncoder;

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    private UserEntity createUserDirect(String email, Role role) {
        UserEntity user = new UserEntity();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode("password123"));
        user.setFullName(email.split("@")[0]);
        user.setRole(role);
        return userRepository.save(user);
    }

    /** Customer qua register API (đường người dùng thật); token qua /auth/login. */
    private String accessToken(String email) {
        Map<?, ?> body = client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email))
            .exchange().expectStatus().isOk()
            .expectBody(Map.class).returnResult().getResponseBody();
        return String.valueOf(body.get("accessToken"));
    }

    private String adminToken() {
        UserEntity admin = createUserDirect("admin-" + UUID.randomUUID() + "@test.local", Role.ADMIN);
        return accessToken(admin.getEmail());
    }

    @Test
    void customerTokenOnAdminUsers403() {
        String email = "customer-" + UUID.randomUUID() + "@test.local";
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"Customer\"}".formatted(email))
            .exchange().expectStatus().isCreated();
        client().get().uri("/admin/users")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken(email))
            .exchange().expectStatus().isEqualTo(403);
    }

    @Test
    void adminTokenOnAdminUsers200PageShape() {
        client().get().uri("/admin/users")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken())
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.items").isArray()
            .jsonPath("$.page").isEqualTo(1)
            .jsonPath("$.size").isEqualTo(20)
            .jsonPath("$.total").isNumber()
            .jsonPath("$.items[0].id").isNotEmpty()
            .jsonPath("$.items[0].email").isNotEmpty()
            .jsonPath("$.items[0].roles[0]").isNotEmpty();
    }

    @Test
    void qFilterOnEmailFragment() {
        String fragment = "qfilter" + System.nanoTime();
        createUserDirect(fragment + "-a@test.local", Role.CUSTOMER);
        createUserDirect("other-" + System.nanoTime() + "@test.local", Role.CUSTOMER);
        client().get().uri("/admin/users?q=" + fragment)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken())
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.total").isEqualTo(1)
            .jsonPath("$.items[0].email").value(email ->
                assertThat(String.valueOf(email)).isEqualTo(fragment + "-a@test.local"));
    }

    @Test
    void paginationSizeParamRespected() {
        String prefix = "page" + System.nanoTime();
        String passwordHash = passwordEncoder.encode("password123"); // encode 1 lần — bulk insert 25 user
        for (int i = 1; i <= 25; i++) {
            UserEntity user = new UserEntity();
            user.setEmail(prefix + "-" + i + "@test.local");
            user.setPasswordHash(passwordHash);
            user.setFullName("Page User " + i);
            user.setRole(Role.CUSTOMER);
            userRepository.save(user);
        }
        String auth = "Bearer " + adminToken();
        client().get().uri("/admin/users?page=1&size=10&q=" + prefix)
            .header(HttpHeaders.AUTHORIZATION, auth)
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.size").isEqualTo(10)
            .jsonPath("$.total").isEqualTo(25)
            .jsonPath("$.items.length()").isEqualTo(10);
        client().get().uri("/admin/users?page=3&size=10&q=" + prefix)
            .header(HttpHeaders.AUTHORIZATION, auth)
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.page").isEqualTo(3)
            .jsonPath("$.items.length()").isEqualTo(5);
    }
}
