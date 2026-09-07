package com.ecommerce.ordering;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AdminCouponController IT (FI-366 SF-1 T11 — spec §4.10 shape): CRUD +
 * validation (%, fixed, window, usage limit) + 2-lớp guard (gateway prefix đã
 * test ở e2e rbac; tại đây layer-2 @PreAuthorize: customer 403, no-token 401).
 * Contracts amendment A2 PENDING coordinator — shape đóng băng theo epic spec.
 */
class AdminCouponApiTest extends AbstractSagaTest {

    @Autowired
    TestRestTemplate rest;

    private static final String ADMIN = jwt("it-admin", "ADMIN", "admin@ecommerce.local");
    private static final String CUSTOMER = jwt("it-cust", "CUSTOMER", "cust@ecommerce.local");

    private String body(String code, String type, long value, Integer limit, String endsAt) {
        return body(code, type, value, limit, null, endsAt);
    }

    private String body(String code, String type, long value, Integer limit, String startsAt, String endsAt) {
        return """
            {"code": "%s", "type": "%s", "value": %d, "minOrderValue": 100000,
             "startsAt": %s, "endsAt": %s, "usageLimit": %s, "active": true,
             "description": "IT coupon %s"}
            """.formatted(code, type, value,
            startsAt == null ? "null" : "\"" + startsAt + "\"",
            endsAt == null ? "null" : "\"" + endsAt + "\"",
            limit == null ? "null" : limit, UUID.randomUUID());
    }

    private ResponseEntity<String> exchange(String path, String token, HttpMethod method, String json) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return rest.exchange(path, method, new HttpEntity<>(json, headers), String.class);
    }

    @Test
    void createUpdateDelete_roundTrip() {
        String code = "IT" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        // CREATE 201 — PERCENT có hạn + limit
        ResponseEntity<String> created = exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body(code, "PERCENT", 10, 5, Instant.now().plusSeconds(3600).toString()));
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        assertThat(created.getBody()).contains("\"code\":\"" + code + "\"");
        assertThat(created.getBody()).contains("\"usedCount\":0");

        // UPDATE 200 — đổi value + limit, usedCount vẫn 0 (preserve)
        ResponseEntity<String> updated = exchange("/admin/coupons/" + code, ADMIN, HttpMethod.PUT,
            body(code, "PERCENT", 15, 9, Instant.now().plusSeconds(7200).toString()));
        assertThat(updated.getStatusCode().value()).isEqualTo(200);
        assertThat(updated.getBody()).contains("\"value\":15");
        assertThat(updated.getBody()).contains("\"usageLimit\":9");

        // DELETE 204 → GET validate endpoint công khai báo không tồn tại
        assertThat(exchange("/admin/coupons/" + code, ADMIN, HttpMethod.DELETE, null)
            .getStatusCode().value()).isEqualTo(204);
        ResponseEntity<String> validate = exchange(
            "/orders/validate-coupon", CUSTOMER, HttpMethod.POST,
            "{\"code\": \"" + code + "\", \"subtotal\": 500000}");
        assertThat(validate.getBody()).contains("không tồn tại");
    }

    @Test
    void createDuplicateCode_conflict409() {
        String code = "IT" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body(code, "FIXED", 50000, null, null)).getStatusCode().value()).isEqualTo(201);
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body(code, "FIXED", 50000, null, null)).getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void validationErrors_400() {
        // PERCENT ngoài [1,100]
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body("ITBADPCT", "PERCENT", 150, null, null)).getStatusCode().value()).isEqualTo(400);
        // FIXED value âm
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body("ITBADFIX", "FIXED", -1, null, null)).getStatusCode().value()).isEqualTo(400);
        // window rỗng: startsAt +1h, endsAt +30' → endsAt trước startsAt
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body("ITBADWIN", "PERCENT", 10, null,
                Instant.now().plusSeconds(3600).toString(), Instant.now().plusSeconds(1800).toString()))
            .getStatusCode().value()).isEqualTo(400);
        // code sai format
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body("it bad code!", "PERCENT", 10, null, null)).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void updateMissing_404_deleteMissing_404() {
        String ghost = "ITGHOST" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        assertThat(exchange("/admin/coupons/" + ghost, ADMIN, HttpMethod.PUT,
            body(ghost, "PERCENT", 10, null, null)).getStatusCode().value()).isEqualTo(404);
        assertThat(exchange("/admin/coupons/" + ghost, ADMIN, HttpMethod.DELETE, null)
            .getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void guard_noToken401_customer403() {
        Map.of(
            "no-token", (Runnable) () -> assertThat(
                exchange("/admin/coupons", null, HttpMethod.POST,
                    body("ITGUARD", "PERCENT", 10, null, null)).getStatusCode().value()).isEqualTo(401),
            "customer", (Runnable) () -> assertThat(
                exchange("/admin/coupons", CUSTOMER, HttpMethod.POST,
                    body("ITGUARD", "PERCENT", 10, null, null)).getStatusCode().value()).isEqualTo(403)
        ).values().forEach(Runnable::run);
    }
}
