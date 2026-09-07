package com.ecommerce.identity.newsletter;

import com.ecommerce.identity.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.reactive.server.WebTestClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT newsletter (SF-13 A8): subscribe mới → 200 subscribed + row + outbox
 * event; dup → 200 already + KHÔNG row thứ 2 KHÔNG event (ACCEPTANCE không
 * double); admin list 200 ADMIN / 403 customer; anonymous POST public OK.
 */
class NewsletterTest extends AbstractIntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    private String uniqueEmail() {
        return "news-" + System.nanoTime() + "@test.local";
    }

    private String adminToken() {
        // mint qua register + promote SQL (IT không có seed) — dùng token mint
        // của base? Base không có mintToken — dùng SQL promote + login.
        String email = "admin-news-" + System.nanoTime() + "@test.local";
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"Admin News\"}".formatted(email))
            .exchange().expectStatus().isCreated();
        jdbc.update("UPDATE users SET role = 'ADMIN' WHERE email = ?", email);
        var body = client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email))
            .exchange().expectStatus().isOk()
            .expectBody(java.util.Map.class).returnResult().getResponseBody();
        return String.valueOf(body.get("accessToken"));
    }

    @Test
    void subscribe_moi200Dup200already_khongDouble() {
        String email = uniqueEmail();

        // anonymous subscribe — public (không token)
        var first = client().post().uri("/newsletter").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\"}".formatted(email))
            .exchange().expectStatus().isOk()
            .expectBody(java.util.Map.class).returnResult().getResponseBody();
        assertThat(first.get("status")).isEqualTo("subscribed");

        Integer rows = jdbc.queryForObject(
            "SELECT count(*) FROM newsletter_subscriptions WHERE email = ?", Integer.class, email);
        assertThat(rows).isEqualTo(1);
        Integer events = jdbc.queryForObject(
            "SELECT count(*) FROM outbox WHERE event_type = 'user.newsletter_subscribed' "
                + "AND payload->'payload'->>'email' = ?", Integer.class, email);
        assertThat(events).isEqualTo(1);

        // dup — 200 already, KHÔNG row thứ 2, KHÔNG event thêm
        var dup = client().post().uri("/newsletter").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\"}".formatted(email))
            .exchange().expectStatus().isOk()
            .expectBody(java.util.Map.class).returnResult().getResponseBody();
        assertThat(dup.get("status")).isEqualTo("already");
        rows = jdbc.queryForObject(
            "SELECT count(*) FROM newsletter_subscriptions WHERE email = ?", Integer.class, email);
        assertThat(rows).isEqualTo(1);
        events = jdbc.queryForObject(
            "SELECT count(*) FROM outbox WHERE event_type = 'user.newsletter_subscribed' "
                + "AND payload->'payload'->>'email' = ?", Integer.class, email);
        assertThat(events).isEqualTo(1);

        // email sai định dạng → 400
        client().post().uri("/newsletter").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"khong-phai-email\"}")
            .exchange().expectStatus().isBadRequest();
    }

    @Test
    void adminList_guard401_403_200() {
        String email = uniqueEmail();
        client().post().uri("/newsletter").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\"}".formatted(email))
            .exchange().expectStatus().isOk();

        // anonymous → 401
        client().get().uri("/admin/newsletter")
            .exchange().expectStatus().isUnauthorized();
        // customer → 403
        String customer = "cust-news-" + System.nanoTime() + "@test.local";
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"C\"}".formatted(customer))
            .exchange().expectStatus().isCreated();
        var custToken = client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(customer))
            .exchange().expectStatus().isOk()
            .expectBody(java.util.Map.class).returnResult().getResponseBody();
        client().get().uri("/admin/newsletter")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + custToken.get("accessToken"))
            .exchange().expectStatus().isForbidden();

        // admin → 200 + thấy subscriber mới nhất
        var admin = client().get().uri("/admin/newsletter?page=1&size=50")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken())
            .exchange().expectStatus().isOk()
            .expectBody(java.util.Map.class).returnResult().getResponseBody();
        var items = (java.util.List<?>) admin.get("items");
        assertThat(items.size()).isGreaterThanOrEqualTo(1);
    }
}
