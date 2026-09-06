package com.ecommerce.inventory.service;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.inventory.api.InsufficientStockException;
import com.ecommerce.inventory.api.dto.InsufficientStockDto;
import com.ecommerce.inventory.api.dto.ReservationCreatedResponse;
import com.ecommerce.inventory.api.dto.ReservationItemDto;
import com.ecommerce.inventory.domain.Reservation;
import com.ecommerce.inventory.domain.ReservationItem;
import com.ecommerce.inventory.domain.ReservationStatus;
import com.ecommerce.inventory.domain.Stock;
import com.ecommerce.inventory.repo.ReservationRepository;
import com.ecommerce.inventory.repo.StockRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Reservation all-or-nothing (spec §4.2 — MỘT tx duy nhất cho mỗi lần tạo):
 * <ol>
 *   <li>Gom trùng variantId + validate TTL (default 30 — contract; cap env).</li>
 *   <li>Self-heal: reservation RESERVED hết hạn của ĐÚNG order này → RELEASED +
 *       hoàn stock + event (đồng bộ "active" với unique index — plan-critic P1).</li>
 *   <li>Replay: order đã có reservation active/committed → trả lại kết quả cũ
 *       (idempotency theo order — contract).</li>
 *   <li>Lock stocks FOR UPDATE (ORDER BY variant_id chống deadlock).</li>
 *   <li>Check TẤT CẢ → thiếu bất kỳ → 409 insufficient[] (collect-all, không trừ gì).</li>
 *   <li>Trừ tất cả + INSERT reservation + outbox `inventory.reserved`.
 *       Race double-fire cùng order: unique index chặn INSERT → catch → replay.</li>
 * </ol>
 * TransactionTemplate thay @Transactional trên method public để catch được
 * {@link DataIntegrityViolationException} SAU khi tx unique-violation đã rollback
 * (tx rollback-only không thể commit lại — pattern catch-ngoài-tx).
 */
@Service
public class ReservationService {

    private static final Logger log = LoggerFactory.getLogger(ReservationService.class);
    private static final int DEFAULT_TTL_MINUTES = 30;
    private static final long MAX_QTY_PER_VARIANT = 1_000_000;

    private final ReservationRepository reservations;
    private final StockRepository stocks;
    private final OutboxWriter outbox;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;
    private final int maxTtlMinutes;

    public ReservationService(
        ReservationRepository reservations,
        StockRepository stocks,
        OutboxWriter outbox,
        ObjectMapper objectMapper,
        TransactionTemplate tx,
        @Value("${inventory.reservation.max-ttl-minutes:60}") int maxTtlMinutes
    ) {
        this.reservations = reservations;
        this.stocks = stocks;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
        this.tx = tx;
        this.maxTtlMinutes = maxTtlMinutes;
    }

    public ReservationCreatedResponse create(String orderId, List<ReservationItemDto> items, Integer ttlMinutes) {
        // (1) Gom trùng variantId — cộng trong long (Integer::sum wrap ÂM →
        // deduct(âm) TĂNG stock = stock inflation; code-review P0) rồi validate cap.
        Map<String, Long> merged = new LinkedHashMap<>();
        items.forEach(i -> merged.merge(i.variantId(), (long) i.qty(), Long::sum));
        boolean overCap = merged.values().stream().anyMatch(q -> q > MAX_QTY_PER_VARIANT);
        if (overCap) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "qty mỗi variant phải <= " + MAX_QTY_PER_VARIANT);
        }

        int ttl = ttlMinutes == null ? DEFAULT_TTL_MINUTES : ttlMinutes;
        if (ttl < 1 || ttl > maxTtlMinutes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "ttlMinutes phải trong khoảng 1.." + maxTtlMinutes);
        }
        String correlationId = correlationId();

        try {
            return tx.execute(status -> doCreate(orderId, merged, ttl, correlationId));
        } catch (DataIntegrityViolationException e) {
            // (6-race) 2 request song song cùng order_id đều qua bước replay —
            // uq_reservations_active_order chặn INSERT thứ 2 → replay cái đã thắng.
            ReservationCreatedResponse existing = replay(orderId);
            if (existing != null) {
                return existing;
            }
            throw e;
        }
    }

    private ReservationCreatedResponse doCreate(String orderId, Map<String, Long> merged,
                                                int ttlMinutes, String correlationId) {
        // (2) Self-heal expired của đúng order này — KHÔNG full-scan (global sweep
        // là việc sweeper). Rowcount-gated: 0 = ai đó đã release → skip.
        reservations.findFirstByOrderIdAndStatusOrderByCreatedAtDesc(orderId, ReservationStatus.RESERVED)
            .filter(r -> r.getExpiresAt().isBefore(Instant.now()))
            .ifPresent(expired -> {
                if (reservations.transition(expired.getId(), ReservationStatus.RESERVED, ReservationStatus.RELEASED) == 1) {
                    restockAndEmitReleased(expired, correlationId);
                    log.info("Self-heal: reservation {} của order {} hết hạn chưa quét → RELEASED (re-reserve được)",
                        expired.getId(), orderId);
                }
            });

        // (3) Replay — idempotency theo order (contract): active RESERVED còn hạn,
        // hoặc COMMITTED (đơn đã trả — không reserve lại). Bỏ qua items incoming.
        ReservationCreatedResponse existing = replay(orderId);
        if (existing != null) {
            return existing;
        }

        // (4) Lock đủ TẤT CẢ trước khi check — thứ tự variant_id chống deadlock.
        Map<String, Stock> locked = new LinkedHashMap<>();
        stocks.lockAllForUpdate(merged.keySet()).forEach(s -> locked.put(s.getVariantId(), s));

        // (5) Check-all → collect-all thiếu (không fail-fast — 409 đầy đủ info).
        List<InsufficientStockDto> insufficient = new ArrayList<>();
        merged.forEach((variantId, qty) -> {
            int available = locked.containsKey(variantId) ? locked.get(variantId).getQuantity() : 0;
            if (qty > available) {
                insufficient.add(new InsufficientStockDto(variantId, qty.intValue(), available));
            }
        });
        if (!insufficient.isEmpty()) {
            throw new InsufficientStockException(insufficient); // rollback = không trừ gì
        }

        // (6) Trừ tất cả + INSERT + outbox — cùng commit. (qty đã qua cap 1M — int safe)
        merged.forEach((variantId, qty) -> stocks.deduct(variantId, qty.intValue()));
        List<ReservationItem> reservationItems = merged.entrySet().stream()
            .map(e -> new ReservationItem(e.getKey(), e.getValue().intValue()))
            .toList();
        Instant expiresAt = Instant.now().plus(Duration.ofMinutes(ttlMinutes));
        Reservation reservation = new Reservation(orderId, ReservationStatus.RESERVED, expiresAt, reservationItems);
        reservation = reservations.saveAndFlush(reservation);

        outbox.write("inventory.reserved", itemsPayload(reservation), correlationId);
        return new ReservationCreatedResponse(reservation.getId(), reservation.getExpiresAt());
    }

    /** Reservation active/committed của order → DTO replay; không có → null. */
    private ReservationCreatedResponse replay(String orderId) {
        return reservations
            .findFirstByOrderIdAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
                orderId, ReservationStatus.RESERVED, Instant.now())
            .or(() -> reservations.findFirstByOrderIdAndStatusOrderByCreatedAtDesc(orderId, ReservationStatus.COMMITTED))
            .map(r -> new ReservationCreatedResponse(r.getId(), r.getExpiresAt()))
            .orElse(null);
    }

    /** Hoàn stock từng item + outbox `inventory.released` — payload schema-exact (camel). */
    private void restockAndEmitReleased(Reservation reservation, String correlationId) {
        reservation.getItems().forEach(item -> stocks.restock(item.variantId(), item.qty()));
        outbox.write("inventory.released", itemsPayload(reservation), correlationId);
    }

    /** Payload `inventory.reserved|released` — items remap jsonb snake → camel (schema freeze). */
    private ObjectNode itemsPayload(Reservation reservation) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("reservationId", reservation.getId().toString());
        payload.put("orderId", reservation.getOrderId());
        ArrayNode items = payload.putArray("items");
        reservation.getItems().forEach(item -> {
            ObjectNode node = items.addObject();
            node.put("variantId", item.variantId());
            node.put("qty", item.qty());
        });
        return payload;
    }

    /** X-Request-Id từ MDC (RequestIdMdcFilter); fallback UUID — envelope đòi non-null. */
    private String correlationId() {
        String requestId = MDC.get("requestId");
        return requestId != null ? requestId : UUID.randomUUID().toString();
    }
}
