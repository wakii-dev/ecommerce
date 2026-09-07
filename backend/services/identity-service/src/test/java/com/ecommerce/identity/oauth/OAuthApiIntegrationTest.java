package com.ecommerce.identity.oauth;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.ecommerce.identity.AbstractIntegrationTest;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.net.URI;
import java.util.concurrent.atomic.AtomicInteger;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.stubFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT OAuth Google (SF-15) — WireMock double cho token + userinfo (pattern
 * payment-service Stripe). Find-or-create + link email + state guard +
 * exchange single-use — ACCEPTANCE: email trùng user cũ → vào đúng tài khoản.
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OAuthApiIntegrationTest extends AbstractIntegrationTest {

    static final WireMockServer WIRE = new WireMockServer(WireMockConfiguration.wireMockConfig().dynamicPort());
    static final AtomicInteger SEQ = new AtomicInteger();

    static WebTestClient http;

    @DynamicPropertySource
    static void oauthProps(DynamicPropertyRegistry registry) {
        WIRE.start();
        com.github.tomakehurst.wiremock.client.WireMock.configureFor("localhost", WIRE.port());
        registry.add("identity.oauth.google.client-id", () -> "it-client");
        registry.add("identity.oauth.google.secret", () -> "it-secret");
        registry.add("identity.oauth.google.token-uri", () -> WIRE.baseUrl() + "/token");
        registry.add("identity.oauth.google.user-info-uri", () -> WIRE.baseUrl() + "/userinfo");
    }

    WebTestClient http() {
        if (http == null) {
            http = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
        }
        return http;
    }

    /** Stub token+userinfo trả profile cho 1 code cụ thể — trả code dùng cho callback. */
    private String stubProfile(String sub, String email, boolean verified, String name) {
        // z-suffix + '&' anchor: stub "code=cd1z&" không khớp nhầm "code=cd12z&"
        String code = "cd" + SEQ.incrementAndGet() + "z";
        String at = "at-" + SEQ.incrementAndGet();
        stubFor(post(urlEqualTo("/token"))
            .withRequestBody(containing("code=" + code + "&"))
            .willReturn(aResponse().withHeader("Content-Type", "application/json")
                .withBody("{\"access_token\":\"" + at + "\",\"token_type\":\"Bearer\"}")));
        // OAuthProviderClient gửi access_token dạng QUERY PARAM (chuẩn Facebook
        // hợp lệ cho cả Google) — stub khớp URL đầy đủ.
        stubFor(get(urlEqualTo("/userinfo?access_token=" + at))
            .willReturn(aResponse().withHeader("Content-Type", "application/json")
                .withBody("{\"sub\":\"" + sub + "\",\"email\":\"" + email
                    + "\",\"email_verified\":" + verified + ",\"name\":\"" + name + "\"}")));
        return code;
    }

    /** State hợp lệ lấy từ authorize 302 (flow thật — không fake state). */
    private String validState(String provider) {
        String[] holder = new String[1];
        http().get().uri("/oauth/" + provider + "/authorize")
            .exchange().expectStatus().isFound()
            .expectHeader().value("Location", l -> {
                assertThat(l).contains("state=");
                holder[0] = l;
            });
        return URI.create(holder[0]).getQuery().replaceAll(".*state=([^&]+).*", "$1");
    }

    /** Callback + trả query của Location FE (?code=... | ?error=...). */
    private String callbackQuery(String provider, String code, String state) {
        String[] holder = new String[1];
        http().get().uri(uri -> uri.path("/oauth/" + provider + "/callback")
                .queryParam("code", code).queryParam("state", state).build())
            .exchange().expectStatus().isFound()
            .expectHeader().value("Location", l -> {
                assertThat(l).startsWith("http://localhost:5173/login/oauth/callback?");
                holder[0] = l;
            });
        return URI.create(holder[0]).getQuery();
    }

    private String exchange(String code, int expectStatus) {
        return http().post().uri("/oauth/exchange")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"code\":\"" + code + "\"}")
            .exchange().expectStatus().isEqualTo(expectStatus)
            .expectBody(String.class).returnResult().getResponseBody();
    }

    private void register(String email, String password, String fullName) {
        http().post().uri("/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"fullName\":\"" + fullName + "\"}")
            .exchange().expectStatus().isCreated();
    }

    @Test
    @Order(1)
    void providersWellKnownReflectsConfig() {
        String body = http().get().uri("/.well-known/oauth-providers")
            .exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
        assertThat(body).contains("\"google\":true").contains("\"facebook\":false");
    }

    @Test
    @Order(2)
    void authorizeRedirectsWithState_unknownProvider400() {
        http().get().uri("/oauth/microsoft/authorize")
            .exchange().expectStatus().isBadRequest();
    }

    @Test
    @Order(3)
    void callbackLinksExistingUserByEmail_noDuplicate() {
        register("glink@example.com", "Password#123", "Link Me");
        String originalId = http().post().uri("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"email\":\"glink@example.com\",\"password\":\"Password#123\"}")
            .exchange().expectStatus().isOk()
            .expectBody(String.class).returnResult().getResponseBody();
        String code = stubProfile("google-sub-link", "glink@example.com", true, "Link Me");
        String query = callbackQuery("google", code, validState("google"));
        assertThat(query).startsWith("code=");
        String oneTime = query.substring("code=".length());

        String body = exchange(oneTime, 200);
        assertThat(body).contains("\"accessToken\"").contains("glink@example.com");

        // Login lại bằng Google lần nữa → CÙNG user (không duplicate):
        String code2 = stubProfile("google-sub-link", "glink@example.com", true, "Link Me");
        String query2 = callbackQuery("google", code2, validState("google"));
        String oneTime2 = query2.substring("code=".length());
        String body2 = exchange(oneTime2, 200);
        assertThat(body2).contains(extract(originalId, "\"id\":\"", "\""));
    }

    @Test
    @Order(4)
    void callbackCreatesUser_exchangeSingleUse() {
        String code = stubProfile("google-sub-new", "newbie@example.com", true, "New Bie");
        String query = callbackQuery("google", code, validState("google"));
        String oneTime = query.substring("code=".length());
        String body = exchange(oneTime, 200);
        assertThat(body).contains("newbie@example.com");
        // Single-use: code đã consume → 401
        exchange(oneTime, 401);
    }

    @Test
    @Order(5)
    void stateMismatchNeverExchanges() {
        String code = stubProfile("google-sub-bad", "badstate@example.com", true, "Bad");
        String query = callbackQuery("google", code, "tampered-state");
        assertThat(query).contains("error=state_mismatch");
    }

    @Test
    @Order(6)
    void unverifiedEmailBlocked() {
        String code = stubProfile("google-sub-unv", "unverified@example.com", false, "Un V");
        String query = callbackQuery("google", code, validState("google"));
        assertThat(query).contains("error=no_email");
    }

    @Test
    @Order(7)
    void providerErrorPassedThrough() {
        String query = callbackQuery("google", "whatever", validState("google"));
        // code=whatever không khớp stub nào → provider_error
        assertThat(query).contains("error=provider_error");
    }

    @Test
    @Order(8)
    void callbackErrorParamPassedThrough() {
        http().get().uri(uri -> uri.path("/oauth/google/callback")
                .queryParam("error", "access_denied").queryParam("state", validState("google")).build())
            .exchange().expectStatus().isFound()
            .expectHeader().value("Location", l -> assertThat(l).contains("error=access_denied"));
    }

    @Test
    @Order(9)
    void oauthOnlyUserPasswordLoginRejected() {
        register("plainpw@example.com", "Password#123", "Plain");
        String code = stubProfile("google-sub-plain", "plainpw@example.com", true, "Plain");
        callbackQuery("google", code, validState("google")); // link user có sẵn
        // Sau khi link, user vẫn có password (đã register) → login thường OK.
        http().post().uri("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"email\":\"plainpw@example.com\",\"password\":\"Password#123\"}")
            .exchange().expectStatus().isOk();

        // OAuth-ONLY user (không từng register) → password login 401 (không NPE).
        String code2 = stubProfile("google-sub-only", "only@example.com", true, "Only");
        callbackQuery("google", code2, validState("google"));
        http().post().uri("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"email\":\"only@example.com\",\"password\":\"Whatever#123\"}")
            .exchange().expectStatus().isUnauthorized();
    }

    private String extract(String json, String key, String stop) {
        int i = json.indexOf(key);
        if (i < 0) return "";
        int from = i + key.length();
        return json.substring(from, json.indexOf(stop, from));
    }
}
