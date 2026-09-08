package com.ecommerce.ordering;

import com.ecommerce.ordering.api.CouponInvalidException;
import com.ecommerce.ordering.service.CouponService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AdminCouponController IT (FI-366 SF-1 T11 — spec §4.10 shape): CRUD +
 * validation (%, fixed, window, usage limit) + 2-lớp guard (gateway prefix đã
 * test ở e2e rbac; tại đây layer-2 @PreAuthorize: customer 403, no-token 401).
 * FI-369 SF-2 bổ sung: GET list (admin view đủ usage fields) + toggle active
 * (N4 — in-flight RESERVED honor, mã mới từ chối) + delete-with-reservation 409.
 * Contracts amendment A3 (FI-371) — shape khớp proposal đã post lên FI-369.
 */
class AdminCouponApiTest extends AbstractSagaTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    CouponService couponService;

    @Autowired
    PlatformTransactionManager txManager;

    private static final String ADMIN = jwt("it-admin", "ADMIN", "admin@ecommerce.local");
    private static final String CUSTOMER = jwt("it-cust", "CUSTOMER", "cust@ecommerce.local");

    /** reserve/finalize cần tx (@Modifying guarded UPDATE) — test gọi trực tiếp qua template riêng, commit ngay để không giữ lock chặn HTTP call sau đó. */
    private <T> T inTx(java.util.function.Supplier<T> work) {
        return new TransactionTemplate(txManager).execute(s -> work.get());
    }

    /** Đọc 1 coupon từ GET /admin/coupons theo code (JSON parse — assert per-field, tránh contains rời rạc). */
    private Map<String, Object> couponInList(String code) {
        ResponseEntity<String> list = exchange("/admin/coupons", ADMIN, HttpMethod.GET, null);
        assertThat(list.getStatusCode().value()).isEqualTo(200);
        try {
            List<Map<String, Object>> items = new ObjectMapper()
                .readValue(list.getBody(), new TypeReference<List<Map<String, Object>>>() {
                });
            return items.stream().filter(m -> code.equals(m.get("code"))).findFirst().orElse(null);
        } catch (Exception e) {
            throw new IllegalStateException("parse admin list fail: " + list.getBody(), e);
        }
    }

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

    // ── FI-369 SF-2 (A3): GET list + toggle + N4 policy ─────────────────────

    @Test
    void list_returnsAllCoupons_withUsageFields() {
        String limited = "ITL" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        String unlimited = "ITU" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body(limited, "PERCENT", 10, 5, null)).getStatusCode().value()).isEqualTo(201);
        assertThat(exchange("/admin/coupons", ADMIN, HttpMethod.POST,
            body(unlimited, "FIXED", 50000, null, null)).getStatusCode().value()).isEqualTo(201);

        // list trả TẤT CẢ (khác public — chỉ running) + đủ shape admin view
        Map<String, Object> rowLimited = couponInList(limited);
        Map<String, Object> rowUnlimited = couponInList(unlimited);
        assertThat(rowLimited).isNotNull();
        assertThat(rowUnlimited).isNotNull();
        assertThat(rowLimited.get("type")).isEqualTo("PERCENT");
        assertThat(rowLimited.get("usageLimit")).isEqualTo(5);
        assertThat(rowLimited.get("usedCount")).isEqualTo(0);
        assertThat(rowLimited.get("active")).isEqualTo(true);
        assertThat(rowUnlimited.get("usageLimit")).isNull();
        assertThat(rowUnlimited.get("value")).isEqualTo(50000);
        assertThat(rowUnlimited.get("usedCount")).isEqualTo(0);
    }

    @Test
    void toggle_roundTrip_rejectsThenAcceptsNewCodes() {
        String code = "ITT" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        exchange("/admin/coupons", ADMIN, HttpMethod.POST, body(code, "PERCENT", 10, 5, null));

        // POST /toggle (flip — contract a205cbf): lần 1 → OFF; validate public fail
        ResponseEntity<String> off = exchange("/admin/coupons/" + code + "/toggle", ADMIN,
            HttpMethod.POST, null);
        assertThat(off.getStatusCode().value()).isEqualTo(200);
        assertThat(off.getBody()).contains("\"active\":false");
        ResponseEntity<String> validateOff = exchange("/orders/validate-coupon", CUSTOMER,
            HttpMethod.POST, "{\"code\": \"" + code + "\", \"subtotal\": 500000}");
        assertThat(validateOff.getBody()).contains("\"valid\":false");
        assertThat(validateOff.getBody()).contains("không còn hiệu lực");

        // lần 2 → ON, dùng được lại
        ResponseEntity<String> on = exchange("/admin/coupons/" + code + "/toggle", ADMIN,
            HttpMethod.POST, null);
        assertThat(on.getStatusCode().value()).isEqualTo(200);
        assertThat(on.getBody()).contains("\"active\":true");
        ResponseEntity<String> validateOn = exchange("/orders/validate-coupon", CUSTOMER,
            HttpMethod.POST, "{\"code\": \"" + code + "\", \"subtotal\": 500000}");
        assertThat(validateOn.getBody()).contains("\"valid\":true");
    }

    @Test
    void toggleMissing_404() {
        String ghost = "ITGHOST" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        assertThat(exchange("/admin/coupons/" + ghost + "/toggle", ADMIN, HttpMethod.POST, null)
            .getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void toggleInFlight_reservationHonored_N4() {
        // N4: đơn đã RESERVED trước toggle off → vẫn finalize, usedCount GIỮ;
        // mã MỚI sau toggle bị từ chối. KHÔNG delete+recreate.
        String code = "ITF" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        exchange("/admin/coupons", ADMIN, HttpMethod.POST, body(code, "PERCENT", 10, 5, null));

        UUID orderId = UUID.randomUUID();
        long discount = inTx(() -> couponService.reserve(orderId, code, 500000));
        assertThat(discount).isEqualTo(50_000);

        assertThat(exchange("/admin/coupons/" + code + "/toggle", ADMIN, HttpMethod.POST, null)
            .getStatusCode().value()).isEqualTo(200);

        // in-flight finalize OK (không ném, không hoàn usedCount)
        inTx(() -> {
            couponService.finalizeForOrder(orderId);
            return null;
        });
        Map<String, Object> row = couponInList(code);
        assertThat(row).isNotNull();
        assertThat(row.get("usedCount")).isEqualTo(1);   // usage giữ sau finalize
        assertThat(row.get("active")).isEqualTo(false);  // mã mới vẫn bị chặn

        // mã MỚI (đơn khác) bị từ chối khi off
        assertThat(inTx(() -> {
            try {
                couponService.reserve(UUID.randomUUID(), code, 500000);
                return false;
            } catch (CouponInvalidException expected) {
                return true;
            }
        })).isTrue();
    }

    @Test
    void deleteWithReservation_policy409_N4() {
        String code = "ITD" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        exchange("/admin/coupons", ADMIN, HttpMethod.POST, body(code, "PERCENT", 10, 5, null));
        UUID orderId = UUID.randomUUID();
        inTx(() -> couponService.reserve(orderId, code, 500000));

        // DELETE khi đang có RESERVED → 409 (không vỡ checkout đang bay)
        assertThat(exchange("/admin/coupons/" + code, ADMIN, HttpMethod.DELETE, null)
            .getStatusCode().value()).isEqualTo(409);
        assertThat(couponInList(code)).isNotNull(); // vẫn còn

        // sau release (chỉ history RELEASED, không còn giữ) → VẪN 409:
        // N4 "DELETE cứng chỉ khi chưa reservation" — row reservation là audit
        // + FK coupon_reservations_coupon_code_fkey giữ code → toggle off thay thế
        inTx(() -> {
            couponService.releaseForOrder(orderId);
            return null;
        });
        ResponseEntity<String> deleteHistory = exchange("/admin/coupons/" + code, ADMIN,
            HttpMethod.DELETE, null);
        assertThat(deleteHistory.getStatusCode().value()).isEqualTo(409);
        assertThat(deleteHistory.getBody()).contains("lịch sử");
        assertThat(couponInList(code)).isNotNull();

        // coupon CHƯA TỪNG có reservation → delete được (204)
        String fresh = "ITDX" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        exchange("/admin/coupons", ADMIN, HttpMethod.POST, body(fresh, "PERCENT", 10, 5, null));
        assertThat(exchange("/admin/coupons/" + fresh, ADMIN, HttpMethod.DELETE, null)
            .getStatusCode().value()).isEqualTo(204);
        assertThat(couponInList(fresh)).isNull();
    }
}
