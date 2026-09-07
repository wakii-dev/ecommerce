package com.ecommerce.identity.twofa;

import com.ecommerce.identity.AbstractIntegrationTest;
import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT 2FA TOTP (SF-15): setup → enable sai/đúng → login challenge → verify
 * TOTP → backup code 1 lần → cap 5 sai → disable 403/400/204 → login thường.
 * Sinh mã TOTP trong test từ secret (java-otp, cùng step 30s).
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class TwoFactorApiIntegrationTest extends AbstractIntegrationTest {

    static final String EMAIL = "twofa-user@example.com";
    static final String PASSWORD = "Password#123";

    static WebTestClient http;
    static String base32Secret;
    static String bearer;
    static String[] backupCodes;

    @DynamicPropertySource
    static void twofaProps(DynamicPropertyRegistry registry) {
        registry.add("identity.twofa.encryption-key", () -> "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=");
    }

    @org.springframework.beans.factory.annotation.Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    WebTestClient http() {
        if (http == null) {
            http = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
        }
        return http;
    }

    private String currentCode(String secret) throws Exception {
        TimeBasedOneTimePasswordGenerator totp = new TimeBasedOneTimePasswordGenerator(
            Duration.ofSeconds(30), 6, TimeBasedOneTimePasswordGenerator.TOTP_ALGORITHM_HMAC_SHA1);
        Key key = new SecretKeySpec(Base32.decode(secret), totp.getAlgorithm());
        return String.format("%06d", totp.generateOneTimePassword(key, Instant.now()));
    }

    private String loginBody(String email, String password) {
        return http().post().uri("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}")
            .exchange().expectStatus().isOk()
            .expectBody(String.class).returnResult().getResponseBody();
    }

    private String bearerToken() {
        String body = loginBody(EMAIL, PASSWORD);
        Matcher m = Pattern.compile("\"challengeToken\":\"([^\"]+)\"").matcher(body);
        if (m.find()) { // 2FA đang bật — hoàn tất verify để lấy token
            String code = null;
            try { code = currentCode(base32Secret); } catch (Exception ignored) { }
            body = verifyBody(m.group(1), code);
        }
        Matcher am = Pattern.compile("\"accessToken\":\"([^\"]+)\"").matcher(body);
        assertThat(am.find()).isTrue();
        return am.group(1);
    }

    private String verifyBody(String challengeToken, String code) {
        return http().post().uri("/2fa/verify")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"challengeToken\":\"" + challengeToken + "\",\"code\":\"" + code + "\"}")
            .exchange().expectStatus().isOk()
            .expectBody(String.class).returnResult().getResponseBody();
    }

    @Test
    @Order(1)
    void setupThenEnable_flow() throws Exception {
        registerAndLogin();

        String body = http().post().uri("/2fa/setup")
            .header("Authorization", "Bearer " + bearer)
            .exchange().expectStatus().isOk()
            .expectBody(String.class).returnResult().getResponseBody();
        Matcher m = Pattern.compile("\"secret\":\"([^\"]+)\"").matcher(body);
        assertThat(m.find()).isTrue();
        base32Secret = m.group(1);
        assertThat(body).contains("otpauth://totp/ShopVN:").contains("secret=");

        // enable sai mã → 400
        http().post().uri("/2fa/enable")
            .header("Authorization", "Bearer " + bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"code\":\"000000\"}")
            .exchange().expectStatus().isBadRequest();

        // enable đúng mã → 10 backup codes
        String enabled = http().post().uri("/2fa/enable")
            .header("Authorization", "Bearer " + bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"code\":\"" + currentCode(base32Secret) + "\"}")
            .exchange().expectStatus().isOk()
            .expectBody(String.class).returnResult().getResponseBody();
        Matcher cm = Pattern.compile("\"recoveryCodes\":\\[([^]]*)]").matcher(enabled);
        assertThat(cm.find()).isTrue();
        backupCodes = cm.group(1).replace("\"", "").split(",");

        // setup lần nữa → 409; /me → twoFactorEnabled true
        http().post().uri("/2fa/setup")
            .header("Authorization", "Bearer " + bearer)
            .exchange().expectStatus().isEqualTo(409);
        assertThat(loginBody(EMAIL, PASSWORD)).contains("\"twoFactorRequired\":true");
    }

    @Test
    @Order(2)
    void loginChallengeAndVerify() throws Exception {
        String body = loginBody(EMAIL, PASSWORD);
        assertThat(body).contains("\"twoFactorRequired\":true").doesNotContain("accessToken");
        String token = extract(body, "challengeToken");

        // sai mã → 401
        http().post().uri("/2fa/verify")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"challengeToken\":\"" + token + "\",\"code\":\"000000\"}")
            .exchange().expectStatus().isUnauthorized();
        // đúng mã → 200 accessToken
        String ok = verifyBody(token, currentCode(base32Secret));
        assertThat(ok).contains("\"accessToken\"");
    }

    @Test
    @Order(3)
    void backupCodeSingleUse() throws Exception {
        // backup code đầu tiên dùng được đúng 1 lần
        String body = loginBody(EMAIL, PASSWORD);
        String token = extract(body, "challengeToken");
        assertThat(verifyBody(token, backupCodes[0])).contains("\"accessToken\"");

        String again = loginBody(EMAIL, PASSWORD);
        String token2 = extract(again, "challengeToken");
        http().post().uri("/2fa/verify")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"challengeToken\":\"" + token2 + "\",\"code\":\"" + backupCodes[0] + "\"}")
            .exchange().expectStatus().isUnauthorized();
    }

    @Test
    @Order(4)
    void fiveWrongCodesConsumeChallenge() throws Exception {
        String body = loginBody(EMAIL, PASSWORD);
        String token = extract(body, "challengeToken");
        for (int i = 0; i < 5; i++) {
            http().post().uri("/2fa/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"challengeToken\":\"" + token + "\",\"code\":\"00000" + i + "\"}")
                .exchange().expectStatus().isUnauthorized();
        }
        // Lần sai thứ 5 consume token — thử tiếp (dù mã đúng) → 401
        http().post().uri("/2fa/verify")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"challengeToken\":\"" + token + "\",\"code\":\"" + currentCode(base32Secret) + "\"}")
            .exchange().expectStatus().isUnauthorized();
    }

    @Test
    @Order(5)
    void disableRequiresPasswordAndCode() throws Exception {
        bearer = bearerToken(); // session mới (đăng nhập qua challenge)
        // password sai → 403
        http().post().uri("/2fa/disable")
            .header("Authorization", "Bearer " + bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"password\":\"Wrong#123\",\"code\":\"" + currentCode(base32Secret) + "\"}")
            .exchange().expectStatus().isForbidden();
        // đúng password, thiếu mã → 400 (REQUIREMENT-GAP #2 semantics)
        http().post().uri("/2fa/disable")
            .header("Authorization", "Bearer " + bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"password\":\"" + PASSWORD + "\"}")
            .exchange().expectStatus().isBadRequest();
        // đủ password + mã → 204; login về thường; /me twoFactorEnabled false
        http().post().uri("/2fa/disable")
            .header("Authorization", "Bearer " + bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"password\":\"" + PASSWORD + "\",\"code\":\"" + currentCode(base32Secret) + "\"}")
            .exchange().expectStatus().isNoContent();
        String normal = loginBody(EMAIL, PASSWORD);
        assertThat(normal).contains("\"accessToken\"").doesNotContain("twoFactorRequired");
    }

    private void registerAndLogin() {
        http().post().uri("/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Two FA\"}")
            .exchange().expectStatus().isCreated();
        bearer = bearerToken();
    }

    /** Giá trị string field từ JSON response (tránh matcher.group không find). */
    private String extract(String json, String field) {
        Matcher m = Pattern.compile("\"" + field + "\":\"([^\"]+)\"").matcher(json);
        assertThat(m.find()).as("field " + field).isTrue();
        return m.group(1);
    }

    @Test
    @Order(6)
    void oauthOnlyUserCannotEnable2fa() {
        // OAuth-only user (password_hash NULL — code-review P1): bật 2FA → 409
        // (disable yêu cầu password nên cho bật = kẹt vĩnh viễn).
        String email = "oauth-only-2fa@example.com";
        http().post().uri("/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue("{\"email\":\"" + email + "\",\"password\":\"Password#123\",\"fullName\":\"OAuth Only\"}")
            .exchange().expectStatus().isCreated();
        String body = loginBody(email, "Password#123");
        String token = extract(body, "accessToken");
        jdbc.update("UPDATE users SET password_hash = NULL WHERE email = ?", email);

        http().post().uri("/2fa/setup")
            .header("Authorization", "Bearer " + token)
            .exchange().expectStatus().isEqualTo(409);
    }
}
