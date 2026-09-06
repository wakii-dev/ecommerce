package com.ecommerce.affiliate;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * IT API affiliate (SF-12): register → PENDING → approve (code 8 ký tự +
 * rate mặc định 5) → track click (cookie aff_ref 30d + dedupe 1/IP/10' +
 * code sai im lặng) → admin reject/resubmit/rate/suspend + RBAC 401/403.
 * Token mint bằng keypair IT (sub/role tùy ý — không cần identity chạy).
 */
class AffiliateApiTest extends AbstractIntegrationTest {

    @Autowired
    TestRestTemplate http;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper om;

    @Test
    void registerApproveVaHosoCodeRateMacDinh() throws Exception {
        String user = UUID.randomUUID().toString();
        String token = mintToken(user, "CUSTOMER");

        // me trước khi đăng ký → 404
        assertThat(status("GET", "/api/affiliate/me", token, null)).isEqualTo(404);

        // register → 202 PENDING
        ResponseEntity<String> reg = post("/api/affiliate/register", token,
            Map.of("portfolioUrl", "https://blog.example", "note", "IT demo"));
        assertThat(reg.getStatusCode().value()).isEqualTo(202);
        JsonNode pending = om.readTree(reg.getBody());
        assertThat(pending.get("status").asText()).isEqualTo("PENDING");
        String affiliateId = pending.get("id").asText();

        // đăng ký lần 2 → 409
        assertThat(post("/api/affiliate/register", token, Map.of()).getStatusCode().value()).isEqualTo(409);

        // me → profile chưa có code
        JsonNode me = om.readTree(get("/api/affiliate/me", token).getBody());
        assertThat(me.get("code").isNull()).isTrue();
        assertThat(me.get("status").asText()).isEqualTo("PENDING");
        assertThat(me.get("rate").doubleValue()).isEqualTo(5.0);   // mặc định hiển thị
        assertThat(me.get("stats").get("clicks").asInt()).isZero();

        // approve → 200, code 8 ký tự + rate 5
        ResponseEntity<String> approved = post("/api/affiliate/admin/affiliates/" + affiliateId + "/approve",
            mintToken("it-admin", "ADMIN"), null);
        assertThat(approved.getStatusCode().value()).isEqualTo(200);
        JsonNode profile = om.readTree(approved.getBody());
        assertThat(profile.get("status").asText()).isEqualTo("APPROVED");
        String code = profile.get("code").asText();
        assertThat(code).hasSize(8).matches("[A-Z2-9]{8}");
        assertThat(profile.get("rate").doubleValue()).isEqualTo(5.0);

        // approve lần nữa → 409 (không còn PENDING)
        assertThat(post("/api/affiliate/admin/affiliates/" + affiliateId + "/approve",
            mintToken("it-admin", "ADMIN"), null).getStatusCode().value()).isEqualTo(409);

        // me sau duyệt → có code
        JsonNode me2 = om.readTree(get("/api/affiliate/me", token).getBody());
        assertThat(me2.get("code").asText()).isEqualTo(code);

        // ledger trống — page chuẩn
        JsonNode ledger = om.readTree(get("/api/affiliate/me/ledger?page=1", token).getBody());
        assertThat(ledger.get("items").isEmpty()).isTrue();
        assertThat(ledger.get("page").asInt()).isEqualTo(1);
    }

    @Test
    void rejectRoiDangKyLai() throws Exception {
        String user = UUID.randomUUID().toString();
        String token = mintToken(user, "CUSTOMER");
        String admin = mintToken("it-admin", "ADMIN");

        String id = om.readTree(post("/api/affiliate/register", token, Map.of("note", "lần 1")).getBody())
            .get("id").asText();
        assertThat(post("/api/affiliate/admin/affiliates/" + id + "/reject", admin, null)
            .getStatusCode().value()).isEqualTo(200);

        // reject lần 2 → 409 (không còn PENDING)
        assertThat(post("/api/affiliate/admin/affiliates/" + id + "/reject", admin, null)
            .getStatusCode().value()).isEqualTo(409);

        // đăng ký lại sau REJECTED (contract) → 202 PENDING lại, VẪN 1 hồ sơ
        assertThat(post("/api/affiliate/register", token, Map.of("note", "lần 2"))
            .getStatusCode().value()).isEqualTo(202);
        Integer rows = jdbc.queryForObject(
            "SELECT count(*) FROM affiliates WHERE user_id = ?", Integer.class, UUID.fromString(user));
        assertThat(rows).isEqualTo(1);
        String statusDb = jdbc.queryForObject(
            "SELECT status FROM affiliates WHERE user_id = ?", String.class, UUID.fromString(user));
        assertThat(statusDb).isEqualTo("PENDING");
    }

    @Test
    void adminDoiRateVaValidateKhoang() throws Exception {
        String user = UUID.randomUUID().toString();
        String token = mintToken(user, "CUSTOMER");
        String admin = mintToken("it-admin", "ADMIN");
        String id = om.readTree(post("/api/affiliate/register", token, Map.of()).getBody()).get("id").asText();
        post("/api/affiliate/admin/affiliates/" + id + "/approve", admin, null);

        // rate ngoài (0, 50] → 400 (validate DTO)
        assertThat(putRate(id, "0", admin)).isEqualTo(400);
        assertThat(putRate(id, "60", admin)).isEqualTo(400);

        // rate 7.5 → profile trả rate mới; đơn sau dùng (consumer test kiểm)
        assertThat(putRate(id, "7.5", admin)).isEqualTo(200);
        JsonNode me = om.readTree(get("/api/affiliate/me", token).getBody());
        assertThat(me.get("rate").doubleValue()).isEqualTo(7.5);
    }

    @Test
    void rbacGuest401Customer403Admin200() {
        String admin = mintToken("it-admin", "ADMIN");
        String customer = mintToken(UUID.randomUUID().toString(), "CUSTOMER");

        // guest chưa đăng nhập → 401 (register + me)
        ResponseEntity<String> guestReg = post("/api/affiliate/register", null, Map.of());
        assertThat(guestReg.getStatusCode().value()).isEqualTo(401);
        assertThat(status("GET", "/api/affiliate/me", null, null)).isEqualTo(401);

        // track click public — guest vẫn 204 (không 401)
        ResponseEntity<String> track = post("/api/affiliate/track/click", null,
            Map.of("refCode", "NOTREAL99"));
        assertThat(track.getStatusCode().value()).isEqualTo(204);

        // customer gọi admin → 403; admin → 200
        assertThat(status("GET", "/api/affiliate/admin/affiliates", customer, null)).isEqualTo(403);
        assertThat(status("GET", "/api/affiliate/admin/affiliates", admin, null)).isEqualTo(200);
    }

    @Test
    void trackClickCookieDedupeVaImLang() throws Exception {
        String user = UUID.randomUUID().toString();
        String token = mintToken(user, "CUSTOMER");
        String admin = mintToken("it-admin", "ADMIN");
        String id = om.readTree(post("/api/affiliate/register", token, Map.of()).getBody()).get("id").asText();
        String code = om.readTree(post("/api/affiliate/admin/affiliates/" + id + "/approve", admin, null)
            .getBody()).get("code").asText();

        HttpHeaders clickHeaders = new HttpHeaders();
        clickHeaders.set("X-Forwarded-For", "10.9.9.9");   // IP cố định cho dedupe

        // click hợp lệ → 204 + Set-Cookie aff_ref 30 ngày httpOnly path=/
        ResponseEntity<String> res = exchange("/api/affiliate/track/click", null,
            Map.of("refCode", code), clickHeaders);
        assertThat(res.getStatusCode().value()).isEqualTo(204);
        String setCookie = String.join(";", res.getHeaders().get("Set-Cookie"));
        assertThat(setCookie).contains("aff_ref=" + code)
            .contains("HttpOnly").contains("Path=/")
            .contains("Max-Age=2592000").contains("SameSite=Lax");

        UUID affiliateId = UUID.fromString(jdbc.queryForObject(
            "SELECT id FROM affiliates WHERE user_id = ?", String.class, UUID.fromString(user)));
        awaitClickCount(code, 1);

        // click lại cùng IP trong 10' → vẫn 1 row (dedupe) nhưng vẫn 204 + cookie
        ResponseEntity<String> res2 = exchange("/api/affiliate/track/click", null,
            Map.of("refCode", code), clickHeaders);
        assertThat(res2.getStatusCode().value()).isEqualTo(204);
        assertThat(res2.getHeaders().get("Set-Cookie")).isNotEmpty();
        awaitClickCount(code, 1);

        // IP khác → row thứ 2
        HttpHeaders otherIp = new HttpHeaders();
        otherIp.set("X-Forwarded-For", "10.9.9.8");
        exchange("/api/affiliate/track/click", null, Map.of("refCode", code), otherIp);
        awaitClickCount(code, 2);

        // code SAI → 204 im lặng: KHÔNG Set-Cookie, KHÔNG click row
        ResponseEntity<String> wrong = exchange("/api/affiliate/track/click", null,
            Map.of("refCode", "ZZZZZZ99"), otherIp);
        assertThat(wrong.getStatusCode().value()).isEqualTo(204);
        assertThat(wrong.getHeaders().get("Set-Cookie")).isNull();

        // thiếu refCode → 400
        assertThat(exchange("/api/affiliate/track/click", null, Map.of(), otherIp)
            .getStatusCode().value()).isEqualTo(400);

        // suspend → track ngừng: 204, KHÔNG cookie, KHÔNG row mới
        assertThat(post("/api/affiliate/admin/affiliates/" + id + "/suspend", admin, null)
            .getStatusCode().value()).isEqualTo(200);
        ResponseEntity<String> suspended = exchange("/api/affiliate/track/click", null,
            Map.of("refCode", code), otherIp);
        assertThat(suspended.getStatusCode().value()).isEqualTo(204);
        assertThat(suspended.getHeaders().get("Set-Cookie")).isNull();
        awaitClickCount(code, 2);   // không tăng

        // reactivate → track lại (cookie trở lại)
        assertThat(post("/api/affiliate/admin/affiliates/" + id + "/reactivate", admin, null)
            .getStatusCode().value()).isEqualTo(200);
        ResponseEntity<String> reactivated = exchange("/api/affiliate/track/click", null,
            Map.of("refCode", code), otherIp);
        assertThat(reactivated.getHeaders().get("Set-Cookie")).isNotNull();
    }

    @Test
    void adminListFilterVaStatsDelta() throws Exception {
        String admin = mintToken("it-admin", "ADMIN");

        // stats admin — baseline TRƯỚC khi tạo hồ sơ (delta +1 affiliate, +1 click)
        JsonNode before = om.readTree(get("/api/affiliate/admin/stats", admin).getBody());

        String user = UUID.randomUUID().toString();
        String token = mintToken(user, "CUSTOMER");
        String id = om.readTree(post("/api/affiliate/register", token, Map.of()).getBody()).get("id").asText();

        // filter status=PENDING chứa hồ sơ mới
        JsonNode pendingPage = om.readTree(
            get("/api/affiliate/admin/affiliates?status=PENDING&size=100", admin).getBody());
        boolean found = false;
        for (JsonNode item : pendingPage.get("items")) {
            found |= item.get("id").asText().equals(id);
        }
        assertThat(found).isTrue();

        post("/api/affiliate/admin/affiliates/" + id + "/approve", admin, null);
        String code = om.readTree(get("/api/affiliate/me", token).getBody()).get("code").asText();
        HttpHeaders ip = new HttpHeaders();
        ip.set("X-Forwarded-For", "10.10.10.10");
        exchange("/api/affiliate/track/click", null, Map.of("refCode", code), ip);
        awaitClickCount(code, 1);

        JsonNode after = om.readTree(get("/api/affiliate/admin/stats", admin).getBody());
        assertThat(after.get("totalAffiliates").asLong())
            .isGreaterThanOrEqualTo(before.get("totalAffiliates").asLong() + 1);
        assertThat(after.get("activeClicks").asLong())
            .isGreaterThanOrEqualTo(before.get("activeClicks").asLong() + 1);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ResponseEntity<String> post(String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        return http.exchange(url(path), HttpMethod.POST,
            new HttpEntity<>(body, headers), String.class);
    }

    private ResponseEntity<String> exchange(String path, String token, Object body, HttpHeaders extra) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        headers.addAll(extra);
        return http.exchange(url(path), HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
    }

    private ResponseEntity<String> get(String path, String token) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return http.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    private int status(String method, String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        ResponseEntity<String> res = http.exchange(url(path), HttpMethod.valueOf(method),
            new HttpEntity<>(body, headers), String.class);
        return res.getStatusCode().value();
    }

    private int putRate(String id, String rate, String admin) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(admin);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange(url("/api/affiliate/admin/affiliates/" + id + "/rate"), HttpMethod.PUT,
            new HttpEntity<>(Map.of("rate", rate), headers), String.class).getStatusCode().value();
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private void awaitClickCount(String code, int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000;
        Long count = -1L;
        while (System.currentTimeMillis() < deadline) {
            count = jdbc.queryForObject("SELECT count(*) FROM clicks WHERE code = ?", Long.class, code);
            if (count != null && count == expected) {
                return;
            }
            Thread.sleep(100);
        }
        org.assertj.core.api.Assertions.fail("click count của " + code + " không đạt " + expected + ": " + count);
    }
}
