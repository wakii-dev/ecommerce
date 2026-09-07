package com.ecommerce.identity.auth;

import com.ecommerce.identity.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT password forgot/reset (SF-13 A1 — contract identity.yaml D21):
 * forgot LUÔN 202 (unknown/known cùng body); token SHA-256 trong DB + raw
 * trong outbox event; reset sai token 401; reset OK → login mật khẩu mới,
 * mật khẩu cũ chết, MỌI refresh token cũ revoked (cookie cũ refresh 401);
 * token reuse 401.
 */
class PasswordResetTest extends AbstractIntegrationTest {

    static final AtomicInteger SEQ = new AtomicInteger();
    static final Pattern RAW_COOKIE = Pattern.compile("refresh_token=([^;]+)");

    @Autowired
    JdbcTemplate jdbc;

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    private String uniqueEmail() {
        return "reset-" + SEQ.incrementAndGet() + "-" + System.nanoTime() + "@test.local";
    }

    private void register(String email, String password) {
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"%s\",\"fullName\":\"Reset IT\"}".formatted(email, password))
            .exchange().expectStatus().isCreated();
    }

    private String loginAndGetSetCookie(String email, String password) {
        return client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))
            .exchange().expectStatus().isOk()
            .returnResult(Void.class).getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE);
    }

    /** Đọc raw token từ outbox event MỚI NHẤT của email (relay tắt trong IT). */
    private String latestResetToken(String email) throws com.fasterxml.jackson.core.JsonProcessingException {
        // outbox row = ENVELOPE JSON (OutboxWriter wrap) → payload thật lồng 1 cấp
        String payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'user.password_reset_requested' "
                + "AND payload->'payload'->>'email' = ? ORDER BY created_at DESC LIMIT 1", String.class, email);
        assertThat(payload).as("outbox event password_reset_requested").isNotNull();
        return com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
            .readTree(payload).path("payload").path("token").asText();
    }

    @Test
    void forgotUnknownEmail_van202_vaKhongTaoToken() {
        String known = uniqueEmail();
        register(known, "password123");
        Map<?, ?> knownBody = client().post().uri("/password/forgot")
            .header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\"}".formatted(known))
            .exchange().expectStatus().isEqualTo(202)
            .expectBody(Map.class).returnResult().getResponseBody();
        Map<?, ?> unknownBody = client().post().uri("/password/forgot")
            .header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"khong-ton-tai-" + System.nanoTime() + "@test.local\"}")
            .exchange().expectStatus().isEqualTo(202)
            .expectBody(Map.class).returnResult().getResponseBody();
        assertThat(unknownBody).isEqualTo(knownBody); // anti-enumeration: body giống hệt
    }

    @Test
    void forgotKnownEmail_taoTokenHashVaOutboxEvent() throws Exception {
        String email = uniqueEmail();
        register(email, "password123");
        client().post().uri("/password/forgot").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\"}".formatted(email))
            .exchange().expectStatus().isEqualTo(202);

        String raw = latestResetToken(email);
        assertThat(raw).isNotBlank();
        Integer tokens = jdbc.queryForObject(
            "SELECT count(*) FROM password_reset_tokens prt JOIN users u ON u.id = prt.user_id "
                + "WHERE u.email = ?", Integer.class, email);
        assertThat(tokens).isEqualTo(1);
    }

    @Test
    void resetSaiToken_401_vaTokenHetHan_401() {
        client().post().uri("/password/reset").header("Content-Type", "application/json")
            .bodyValue("{\"token\":\"sai-token-lung-linh\",\"newPassword\":\"newpass456\"}")
            .exchange().expectStatus().isEqualTo(401)
            .expectHeader().contentTypeCompatibleWith("application/problem+json");
    }

    @Test
    void resetFlow_doiMatKhau_revokeRefreshCunion_cu() throws Exception {
        String email = uniqueEmail();
        register(email, "password123");
        // login TRƯỚC reset → giữ cookie refresh cũ
        String setCookieOld = loginAndGetSetCookie(email, "password123");

        client().post().uri("/password/forgot").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\"}".formatted(email))
            .exchange().expectStatus().isEqualTo(202);
        String raw = latestResetToken(email);

        client().post().uri("/password/reset").header("Content-Type", "application/json")
            .bodyValue("{\"token\":\"%s\",\"newPassword\":\"newpass456\"}".formatted(raw))
            .exchange().expectStatus().isNoContent();

        // mật khẩu cũ chết
        client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email))
            .exchange().expectStatus().isUnauthorized();
        // mật khẩu mới sống
        client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"newpass456\"}".formatted(email))
            .exchange().expectStatus().isOk();

        // refresh token CŨ đã revoke
        Matcher matcher = RAW_COOKIE.matcher(setCookieOld);
        assertThat(matcher.find()).isTrue();
        client().post().uri("/auth/refresh")
            .header(HttpHeaders.COOKIE, "refresh_token=" + matcher.group(1))
            .exchange().expectStatus().isUnauthorized();

        // token reset đã dùng → reuse 401
        client().post().uri("/password/reset").header("Content-Type", "application/json")
            .bodyValue("{\"token\":\"%s\",\"newPassword\":\"another789\"}".formatted(raw))
            .exchange().expectStatus().isEqualTo(401);
    }
}
