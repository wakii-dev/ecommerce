package com.ecommerce.inventory;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IT reservation all-or-nothing (plan T2 — spec §4.2 + §7 case 1):
 * đủ/thiếu stock · duplicate variant gom trùng · replay idempotency theo order ·
 * race 2 thread cùng order (unique index) · race 2 order tranh last stock ·
 * self-heal expired chưa quét · 409 không trừ gì.
 * Mỗi test dùng variant/order id riêng — không đụng state test khác.
 */
class ReservationApiTest extends AbstractIntegrationTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    JdbcTemplate jdbc;

    private static final AtomicInteger SEQ = new AtomicInteger();

    /** Seed 1 variant với stock cho trước, trả variantId. */
    private String seedStock(int quantity) {
        String variantId = "var-t2-" + SEQ.incrementAndGet();
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, ?)", variantId, quantity);
        return variantId;
    }

    private int stockOf(String variantId) {
        return jdbc.queryForObject("SELECT quantity FROM stocks WHERE variant_id = ?", Integer.class, variantId);
    }

    private ResponseEntity<Map> reserve(String orderId, List<Map<String, Object>> items, Integer ttlMinutes) {
        var body = new java.util.HashMap<String, Object>();
        body.put("orderId", orderId);
        body.put("items", items);
        if (ttlMinutes != null) {
            body.put("ttlMinutes", ttlMinutes);
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Request-Id", "it-" + UUID.randomUUID());
        return rest.postForEntity("/inventory/reservations", new HttpEntity<>(body, headers), Map.class);
    }

    private List<Map<String, Object>> items(String variantId, int qty) {
        return List.of(Map.of("variantId", variantId, "qty", qty));
    }

    @Test
    void reserveEnoughStockReturns201AndDeducts() {
        String v1 = seedStock(50);
        String v2 = seedStock(30);

        ResponseEntity<Map> response = reserve("order-" + SEQ.incrementAndGet(),
            List.of(Map.of("variantId", v1, "qty", 10), Map.of("variantId", v2, "qty", 5)), null);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getBody().get("reservationId")).isNotNull();
        // expiresAt ≈ now + 30' (default contract)
        OffsetDateTime expiresAt = OffsetDateTime.parse((String) response.getBody().get("expiresAt"));
        assertThat(expiresAt.toInstant()).isAfter(Instant.now().plus(java.time.Duration.ofMinutes(29)));
        assertThat(expiresAt.toInstant()).isBefore(Instant.now().plus(java.time.Duration.ofMinutes(31)));
        assertThat(stockOf(v1)).isEqualTo(40);
        assertThat(stockOf(v2)).isEqualTo(25);

        // jsonb items SNAKE_CASE (casing PIN — plan-critic P0-2)
        String jsonbKey = jdbc.queryForObject(
            "SELECT items->0->>'variant_id' FROM reservations WHERE order_id = ?",
            String.class, orderIdOf(response));
        assertThat(jsonbKey).as("jsonb items phải snake_case variant_id").isNotNull();
    }

    private String orderIdOf(ResponseEntity<Map> response) {
        return jdbc.queryForObject(
            "SELECT order_id FROM reservations WHERE id = ?::uuid",
            String.class, response.getBody().get("reservationId"));
    }

    @Test
    void insufficientAnyVariantReturns409AllOrNothingAndCollectsAll() {
        String enough = seedStock(100);
        String lacking1 = seedStock(3);
        String lacking2 = seedStock(0);
        String orderId = "order-" + SEQ.incrementAndGet();

        ResponseEntity<Map> response = reserve(orderId, List.of(
            Map.of("variantId", enough, "qty", 1),
            Map.of("variantId", lacking1, "qty", 10),
            Map.of("variantId", lacking2, "qty", 1)), null);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        List<Map> insufficient = (List<Map>) response.getBody().get("insufficient");
        assertThat(insufficient).as("collect-ALL variants thiếu, không fail-fast").hasSize(2);
        assertThat(insufficient).anySatisfy(row -> {
            assertThat(row.get("variantId")).isEqualTo(lacking1);
            assertThat(row.get("requested")).isEqualTo(10);
            assertThat(row.get("available")).isEqualTo(3);
        });
        assertThat(insufficient).anySatisfy(row -> {
            assertThat(row.get("variantId")).isEqualTo(lacking2);
            assertThat(row.get("available")).isEqualTo(0);
        });
        // ALL-OR-NOTHING: variant đủ stock KHÔNG bị trừ
        assertThat(stockOf(enough)).as("không trừ gì khi 1 item thiếu").isEqualTo(100);
        assertThat(jdbc.queryForObject(
            "SELECT count(*) FROM reservations WHERE order_id = ?", Integer.class, orderId)).isZero();
    }

    @Test
    void duplicateVariantLinesAggregatedBeforeCheck() {
        String variant = seedStock(8);

        ResponseEntity<Map> response = reserve("order-" + SEQ.incrementAndGet(),
            List.of(Map.of("variantId", variant, "qty", 5), Map.of("variantId", variant, "qty", 6)), null);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        List<Map> insufficient = (List<Map>) response.getBody().get("insufficient");
        assertThat(insufficient).hasSize(1);
        assertThat(insufficient.get(0).get("requested")).as("gom trùng 5+6=11 trước check").isEqualTo(11);
        assertThat(insufficient.get(0).get("available")).isEqualTo(8);
        assertThat(stockOf(variant)).isEqualTo(8);
    }

    @Test
    void sameOrderReplaysExistingReservationWithoutDoubleDeduct() {
        String variant = seedStock(50);
        String orderId = "order-" + SEQ.incrementAndGet();

        ResponseEntity<Map> first = reserve(orderId, items(variant, 7), null);
        assertThat(first.getStatusCode().value()).isEqualTo(201);
        UUID firstReservationId = UUID.fromString((String) first.getBody().get("reservationId"));

        ResponseEntity<Map> second = reserve(orderId, items(variant, 7), null);
        assertThat(second.getStatusCode().value()).isEqualTo(201);
        assertThat(second.getBody().get("reservationId")).isEqualTo(firstReservationId.toString());
        assertThat(stockOf(variant)).as("replay không trừ thêm").isEqualTo(43);
    }

    @Test
    void concurrentSameOrderDoubleFireYieldsSingleActiveReservation() throws Exception {
        String variant = seedStock(50);
        String orderId = "order-" + SEQ.incrementAndGet();

        List<ResponseEntity<Map>> results = runConcurrent(2, () -> reserve(orderId, items(variant, 9), null));

        assertThat(results).allSatisfy(r -> assertThat(r.getStatusCode().value()).isEqualTo(201));
        Integer activeCount = jdbc.queryForObject(
            "SELECT count(*) FROM reservations WHERE order_id = ? AND status = 'RESERVED'",
            Integer.class, orderId);
        assertThat(activeCount).as("partial unique index: đúng 1 reservation active").isEqualTo(1);
        assertThat(stockOf(variant)).as("chỉ trừ ĐÚNG 1 lần dù 2 request").isEqualTo(41);
    }

    @Test
    void concurrentDifferentOrdersRacingLastStockExactlyOneWins() throws Exception {
        String variant = seedStock(10);

        List<ResponseEntity<Map>> results = runConcurrent(2, () ->
            reserve("order-" + SEQ.incrementAndGet(), items(variant, 8), null));

        long created = results.stream().filter(r -> r.getStatusCode().value() == 201).count();
        long conflicts = results.stream().filter(r -> r.getStatusCode().value() == 409).count();
        assertThat(created).as("đúng 1 thread thắng all-or-nothing").isEqualTo(1);
        assertThat(conflicts).isEqualTo(1);
        assertThat(stockOf(variant)).isEqualTo(2);
    }

    @Test
    void reReserveWhenOldReservationExpiredButNotSweptSelfHeals() {
        String variant = seedStock(10);
        String orderId = "order-" + SEQ.incrementAndGet();
        Long releasedBefore = jdbc.queryForObject(
            "SELECT count(*) FROM outbox WHERE event_type = 'inventory.released'", Long.class);

        // Seed reservation RESERVED đã hết hạn chưa quét (stock 10 = sau khi trừ 2)
        UUID oldId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO reservations (id, order_id, status, expires_at, items)
                VALUES (?::uuid, ?, 'RESERVED', now() - interval '1 minute', ?::jsonb)
                """,
            oldId, orderId, "[{\"variant_id\":\"" + variant + "\",\"qty\":2}]");

        ResponseEntity<Map> response = reserve(orderId, items(variant, 4), null);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        // self-heal hoàn 2 → 12 → trừ 4 → 8; reservation cũ RELEASED, không replay nhầm reservation chết
        assertThat(stockOf(variant)).isEqualTo(8);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM reservations WHERE id = ?::uuid", String.class, oldId)).isEqualTo("RELEASED");
        Integer newActive = jdbc.queryForObject(
            "SELECT count(*) FROM reservations WHERE order_id = ? AND status = 'RESERVED'", Integer.class, orderId);
        assertThat(newActive).isEqualTo(1);
        Long releasedAfter = jdbc.queryForObject(
            "SELECT count(*) FROM outbox WHERE event_type = 'inventory.released'", Long.class);
        assertThat(releasedAfter).as("self-heal emit inventory.released (delta +1)")
            .isEqualTo(releasedBefore + 1);
    }

    @Test
    void invalidTtlAndMissingFieldsReturn400() {
        String variant = seedStock(10);

        assertThat(reserve("order-" + SEQ.incrementAndGet(), items(variant, 1), 0).getStatusCode().value()).isEqualTo(400);
        assertThat(reserve("order-" + SEQ.incrementAndGet(), items(variant, 1), 61).getStatusCode().value()).isEqualTo(400);
        assertThat(reserve("order-" + SEQ.incrementAndGet(), items(variant, 0), null).getStatusCode().value()).isEqualTo(400);
    }

    private List<ResponseEntity<Map>> runConcurrent(int threads, Callable<ResponseEntity<Map>> call) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<ResponseEntity<Map>>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(call));
            }
            List<ResponseEntity<Map>> results = new ArrayList<>();
            for (Future<ResponseEntity<Map>> future : futures) {
                results.add(future.get());
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }
}
