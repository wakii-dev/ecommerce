package com.ecommerce.inventory.service;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.inventory.domain.Reservation;
import com.ecommerce.inventory.domain.ReservationStatus;
import com.ecommerce.inventory.repo.ReservationRepository;
import com.ecommerce.inventory.repo.StockRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * TTL sweep (pack item 5): reservation RESERVED quá `expires_at` → RELEASE +
 * hoàn stock + event `inventory.released`.
 *
 * <p>Guarded transition (rowcount-gated): chỉ khi transition RESERVED→RELEASED
 * thắng mới hoàn stock + emit — race với consumer `order.paid` (commit trước)
 * thì sweep thấy rowcount=0 → skip, KHÔNG phantom-restock đơn đã trả (spec §4.5).
 * Payload schema-exact — reason `ttl_expired` chỉ ở log (schema không có field).</p>
 */
@Component
public class InventorySweeper {

    private static final Logger log = LoggerFactory.getLogger(InventorySweeper.class);
    private static final int BATCH_SIZE = 100;
    private static final String TTL_EXPIRED_REASON = "ttl_expired"; // log-only — không nằm trong event schema

    private final ReservationRepository reservations;
    private final StockRepository stocks;
    private final OutboxWriter outbox;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public InventorySweeper(
        ReservationRepository reservations,
        StockRepository stocks,
        OutboxWriter outbox,
        ObjectMapper objectMapper,
        TransactionTemplate tx
    ) {
        this.reservations = reservations;
        this.stocks = stocks;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
        this.tx = tx;
    }

    /** Interval config `inventory.reservation.sweep-interval-ms` (test đặt ngắn). */
    @Scheduled(fixedDelayString = "${inventory.reservation.sweep-interval-ms:30000}")
    public void releaseExpired() {
        List<Reservation> expired = reservations
            .findByStatusAndExpiresAtBefore(ReservationStatus.RESERVED, Instant.now(), Limit.of(BATCH_SIZE));
        expired.forEach(this::releaseOne);
        if (!expired.isEmpty()) {
            log.info("TTL sweep: released {} reservation(s) — reason {}", expired.size(), TTL_EXPIRED_REASON);
        }
    }

    void releaseOne(Reservation reservation) {
        Boolean released = tx.execute(status -> {
            if (reservations.transition(reservation.getId(), ReservationStatus.RESERVED, ReservationStatus.RELEASED) != 1) {
                return false; // consumer vừa COMMITTED/RELEASED trước — skip
            }
            reservation.getItems().forEach(item -> stocks.restock(item.variantId(), item.qty()));
            outbox.write("inventory.released", payload(reservation), "system:ttl-sweeper");
            return true;
        });
        if (released != null && !released) {
            log.debug("Reservation {} đã đổi trạng thái trước khi sweep — skip", reservation.getId());
        }
    }

    /** Payload `inventory.released` — items remap jsonb snake → camel (schema freeze). */
    private ObjectNode payload(Reservation reservation) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("reservationId", reservation.getId().toString());
        node.put("orderId", reservation.getOrderId());
        ArrayNode items = node.putArray("items");
        reservation.getItems().forEach(item -> {
            ObjectNode itemNode = items.addObject();
            itemNode.put("variantId", item.variantId());
            itemNode.put("qty", item.qty());
        });
        return node;
    }
}
