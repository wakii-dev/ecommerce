package com.ecommerce.inventory;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT availability + low-stock (plan T3 — spec §4.3/§4.4): jsonb reserved SUM
 * đúng (snake keys), reservation hết hạn KHÔNG tính, low-stock lọc + threshold
 * param override + product fields nullable.
 *
 * <p>FI-366 SF-1 T10: low-stock giờ admin-guarded — helper gắn Bearer
 * {@code mintToken("ADMIN")}; thêm test guard 401/403 (customer JWT → 403).</p>
 */
class InventoryQueryTest extends AbstractIntegrationTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    private static final AtomicInteger SEQ = new AtomicInteger();

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> availability(String variantIds) {
        return rest.getForEntity("/inventory/availability?variantIds=" + variantIds, List.class).getBody();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> lowStock(Integer threshold) {
        return (List<Map<String, Object>>) lowStockWithRole(threshold, "ADMIN").getBody();
    }

    /** Guard test dùng — role tuỳ ý để assert 401/403/200. */
    private ResponseEntity<List> lowStockWithRole(Integer threshold, String role) {
        String url = threshold != null ? "/inventory/admin/low-stock?threshold=" + threshold
            : "/inventory/admin/low-stock";
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(mintToken(role));
        return rest.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), List.class);
    }

    @Test
    void availabilityReturnsAvailableAndReservedSumFromActiveReservations() {
        String v = "var-t3-" + SEQ.incrementAndGet();
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, 40)", v);
        // 2 reservation active: 5 + 3 = reserved 8; jsonb SNAKE keys
        jdbc.update("""
                INSERT INTO reservations (id, order_id, status, expires_at, items)
                VALUES (?::uuid, ?, 'RESERVED', now() + interval '20 minutes', ?::jsonb)
                """,
            UUID.randomUUID(), "o-a-" + v, "[{\"variant_id\":\"" + v + "\",\"qty\":5}]");
        jdbc.update("""
                INSERT INTO reservations (id, order_id, status, expires_at, items)
                VALUES (?::uuid, ?, 'RESERVED', now() + interval '20 minutes', ?::jsonb)
                """,
            UUID.randomUUID(), "o-b-" + v, "[{\"variant_id\":\"" + v + "\",\"qty\":3}]");

        List<Map<String, Object>> rows = availability(v);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("variantId")).isEqualTo(v);
        assertThat(rows.get(0).get("available")).isEqualTo(40);
        assertThat(rows.get(0).get("reserved")).as("SUM jsonb 5+3").isEqualTo(8);
    }

    @Test
    void expiredReservationExcludedFromReservedSum() {
        String v = "var-t3-" + SEQ.incrementAndGet();
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, 40)", v);
        // hết hạn chưa quét + active: chỉ active tính
        jdbc.update("""
                INSERT INTO reservations (id, order_id, status, expires_at, items)
                VALUES (?::uuid, ?, 'RESERVED', now() - interval '5 minutes', ?::jsonb)
                """,
            UUID.randomUUID(), "o-x-" + v, "[{\"variant_id\":\"" + v + "\",\"qty\":9}]");
        jdbc.update("""
                INSERT INTO reservations (id, order_id, status, expires_at, items)
                VALUES (?::uuid, ?, 'RESERVED', now() + interval '5 minutes', ?::jsonb)
                """,
            UUID.randomUUID(), "o-y-" + v, "[{\"variant_id\":\"" + v + "\",\"qty\":2}]");

        List<Map<String, Object>> rows = availability(v);
        assertThat(rows.get(0).get("reserved")).as("expired chưa quét không tính").isEqualTo(2);
    }

    @Test
    void availabilityOnlyReturnsVariantsWithStockRows() {
        String v = "var-t3-" + SEQ.incrementAndGet();

        List<Map<String, Object>> rows = availability(v);
        assertThat(rows).as("không có row stocks → không trả (contract)").isEmpty();
    }

    @Test
    void lowStockFiltersByThresholdWithNullableProductFields() {
        String high = "var-t3-" + SEQ.incrementAndGet();
        String low = "var-t3-" + SEQ.incrementAndGet();
        String critical = "var-t3-" + SEQ.incrementAndGet();
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, 50)", high);
        jdbc.update("INSERT INTO stocks (variant_id, quantity, product_id, product_name) VALUES (?, 3, 'prod-1', N'Áo thun đen M')", low);
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, 0)", critical);

        List<Map<String, Object>> rows = lowStock(10);

        List<String> ids = rows.stream().map(r -> (String) r.get("variantId")).toList();
        assertThat(ids).contains(low, critical).doesNotContain(high);
        // order tăng dần: critical (0) trước low (3)
        assertThat(ids.indexOf(critical)).isLessThan(ids.indexOf(low));
        // nullable product fields
        Map<String, Object> criticalRow = rows.stream()
            .filter(r -> r.get("variantId").equals(critical)).findFirst().orElseThrow();
        assertThat(criticalRow.get("productId")).isNull();
        assertThat(criticalRow.get("productName")).isNull();
        assertThat(criticalRow.get("threshold")).isEqualTo(10);
        Map<String, Object> lowRow = rows.stream()
            .filter(r -> r.get("variantId").equals(low)).findFirst().orElseThrow();
        assertThat(lowRow.get("productId")).isEqualTo("prod-1");
    }

    @Test
    void lowStockThresholdParamOverridesDefault() {
        String v = "var-t3-" + SEQ.incrementAndGet();
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, 15)", v);

        assertThat(lowStock(null)).as("15 > default 10 → không nằm trong danh sách")
            .extracting(r -> r.get("variantId")).doesNotContain(v);
        assertThat(lowStock(20)).as("threshold param override → nằm trong danh sách")
            .extracting(r -> r.get("variantId")).contains(v);
    }

    // ── Guard tests (FI-366 SF-1 T10 — audit E7: RBAC inventory hở) ─────────

    @Test
    void lowStockWithoutTokenIs401() {
        ResponseEntity<List> res = rest.getForEntity("/inventory/admin/low-stock", List.class);
        assertThat(res.getStatusCode().value()).as("không token → 401 fail-closed").isEqualTo(401);
    }

    @Test
    void lowStockWithCustomerTokenIs403() {
        // ACCEPTANCE 5 (pack): customer JWT gọi /api/inventory/admin/low-stock → 403
        ResponseEntity<List> res = lowStockWithRole(null, "CUSTOMER");
        assertThat(res.getStatusCode().value()).as("CUSTOMER thiếu ROLE_ADMIN → 403").isEqualTo(403);
    }

    @Test
    void availabilityStillPublicWithoutToken() {
        // guest PDP gọi availability — permitAll giữ nguyên sau khi thêm guard
        String v = "var-t3-" + SEQ.incrementAndGet();
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, 40)", v);
        ResponseEntity<List> res = rest.getForEntity("/inventory/availability?variantIds=" + v, List.class);
        assertThat(res.getStatusCode().value()).as("availability public (PDP guest)").isEqualTo(200);
    }
}
