package com.ecommerce.identity.auth;

import com.ecommerce.identity.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Đầy đủ luồng auth: register → login → refresh (rotate) → logout (revoke) → reuse 401. */
class AuthApiIntegrationTest extends AbstractIntegrationTest {

    static final AtomicInteger SEQ = new AtomicInteger();
    static final Pattern RAW_COOKIE = Pattern.compile("refresh_token=([^;]+)");

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    private String uniqueEmail() {
        return "user-" + SEQ.incrementAndGet() + "-" + System.nanoTime() + "@test.local";
    }

    private void register(String email, String fullName) {
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"%s\"}".formatted(email, fullName))
            .exchange().expectStatus().isCreated();
    }

    /** Login + đọc body JSON thành Map (executor CHỈNH: đọc accessToken từ Map, không toString()). */
    @SuppressWarnings("unchecked")
    private Map<String, Object> loginBody(String email, String password) {
        return client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))
            .exchange().expectStatus().isOk()
            .expectBody(Map.class).returnResult().getResponseBody();
    }

    /** Login + trả Set-Cookie header (raw). */
    private String loginAndGetSetCookie(String email) {
        return client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email))
            .exchange().expectStatus().isOk()
            .returnResult(Void.class).getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE);
    }

    private static String rawCookie(String setCookie) {
        Matcher matcher = RAW_COOKIE.matcher(setCookie);
        assertThat(matcher.find()).as("Set-Cookie phải chứa refresh_token").isTrue();
        return matcher.group(1);
    }

    @Test
    void registerReturns201UserSummaryCustomer() {
        String email = uniqueEmail();
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"Nguyen Van A\"}".formatted(email))
            .exchange().expectStatus().isCreated()
            .expectBody()
            .jsonPath("$.id").isNotEmpty()
            .jsonPath("$.email").isEqualTo(email)
            .jsonPath("$.fullName").isEqualTo("Nguyen Van A")
            .jsonPath("$.roles[0]").isEqualTo("CUSTOMER");
    }

    @Test
    void registerDuplicateEmail409_andInvalidBody400() {
        String email = uniqueEmail();
        String body = "{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"Dup\"}".formatted(email);
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue(body).exchange().expectStatus().isCreated();
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue(body).exchange().expectStatus().isEqualTo(409)
            .expectHeader().contentTypeCompatibleWith("application/problem+json");
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"not-an-email\",\"password\":\"short\",\"fullName\":\"\"}")
            .exchange().expectStatus().isBadRequest()
            .expectHeader().contentTypeCompatibleWith("application/problem+json");
    }

    @Test
    void loginReturnsBearerToken_andHttpOnlyRefreshCookie() {
        String email = uniqueEmail();
        register(email, "Nguyen Van B");
        String setCookie = loginAndGetSetCookie(email);
        assertThat(setCookie).contains("HttpOnly").contains("SameSite=Lax").contains("Max-Age=");
        Map<String, Object> body = loginBody(email, "password123");
        assertThat(String.valueOf(body.get("accessToken"))).isNotBlank();
        assertThat(body.get("tokenType")).isEqualTo("Bearer");
        assertThat(((Number) body.get("expiresIn")).longValue()).isEqualTo(900);
        assertThat(((Map<?, ?>) body.get("user")).get("email")).isEqualTo(email);
    }

    @Test
    void loginWrongPassword401() {
        String email = uniqueEmail();
        register(email, "Wrong Pass");
        client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"wrongpassword\"}".formatted(email))
            .exchange().expectStatus().isEqualTo(401)
            .expectHeader().contentTypeCompatibleWith("application/problem+json");
    }

    /** Email normalize lowercase ở register + login lookup (spec §4.2 — UNIQUE case-sensitive của PG). */
    @Test
    void loginEmailCaseInsensitive() {
        String mixed = "MiXeD-" + System.nanoTime() + "@Test.LOCAL";
        register(mixed, "Case User");
        Map<String, Object> body = loginBody(mixed.toLowerCase(), "password123");
        assertThat(((Map<?, ?>) body.get("user")).get("email")).isEqualTo(mixed.toLowerCase());
    }

    @Test
    void refreshRotates_oldTokenBecomes401() {
        String email = uniqueEmail();
        register(email, "Rotating User");
        String firstSetCookie = loginAndGetSetCookie(email);
        String firstRaw = rawCookie(firstSetCookie);

        var refreshed = client().post().uri("/auth/refresh").cookie("refresh_token", firstRaw)
            .exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.accessToken").isNotEmpty();
        String secondSetCookie = refreshed
            .returnResult().getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE);
        String secondRaw = rawCookie(secondSetCookie);
        assertThat(secondRaw).as("rotation cấp token MỚI").isNotEqualTo(firstRaw);

        client().post().uri("/auth/refresh").cookie("refresh_token", firstRaw)
            .exchange().expectStatus().isEqualTo(401);
    }

    @Test
    void logoutRevokes_andReuseAfterLogout401() {
        String email = uniqueEmail();
        register(email, "Logout User");
        String raw = rawCookie(loginAndGetSetCookie(email));

        client().post().uri("/auth/logout").cookie("refresh_token", raw)
            .exchange().expectStatus().isNoContent();

        client().post().uri("/auth/refresh").cookie("refresh_token", raw)
            .exchange().expectStatus().isEqualTo(401);
    }

    @Test
    void refreshWithoutCookie401() {
        client().post().uri("/auth/refresh").exchange().expectStatus().isEqualTo(401);
    }

    @Test
    void meRequiresJwt_updateProfilePersists() {
        String email = uniqueEmail();
        register(email, "Profile User");
        String accessToken = String.valueOf(loginBody(email, "password123").get("accessToken"));

        client().get().uri("/me").exchange().expectStatus().isEqualTo(401);
        client().get().uri("/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.email").isEqualTo(email)
            .jsonPath("$.twoFactorEnabled").isEqualTo(false);

        client().patch().uri("/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .header("Content-Type", "application/json")
            .bodyValue("{\"fullName\":\"Ten Moi\",\"phone\":\"0901234567\"}")
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.fullName").isEqualTo("Ten Moi")
            .jsonPath("$.phone").isEqualTo("0901234567");

        client().get().uri("/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.fullName").isEqualTo("Ten Moi")
            .jsonPath("$.phone").isEqualTo("0901234567");
    }
}
