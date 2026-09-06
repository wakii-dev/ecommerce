package com.ecommerce.inventory.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
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
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import static com.ecommerce.inventory.config.RabbitMqConfig.QUEUE_ORDERS;

/**
 * Consumer `order.*` điều khiển reservation (spec §4.6 — commit/release KHÔNG
 * qua REST, chỉ events). Idempotent qua {@link IdempotentConsumer} (eventId)
 * — re-delivery at-least-once không double-commit/release.
 *
 * <p>MỘT tx cho marker + business + outbox (TransactionTemplate — javadoc
 * IdempotentConsumer: marker cùng tx business, rollback = không ghost-marker).
 * Transition guarded (rowcount-gated): order.paid tới khi reservation đã bị
 * TTL release → rowcount=0 → warn + no-op, KHÔNG double-trừ (late-payment là
 * việc ordering).</p>
 */
@Component
public class InventoryOrderConsumer {

    private static final Logger log = LoggerFactory.getLogger(InventoryOrderConsumer.class);

    private final ReservationRepository reservations;
    private final StockRepository stocks;
    private final OutboxWriter outbox;
    private final IdempotentConsumer idempotentConsumer;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public InventoryOrderConsumer(
        ReservationRepository reservations,
        StockRepository stocks,
        OutboxWriter outbox,
        IdempotentConsumer idempotentConsumer,
        ObjectMapper objectMapper,
        TransactionTemplate tx
    ) {
        this.reservations = reservations;
        this.stocks = stocks;
        this.outbox = outbox;
        this.idempotentConsumer = idempotentConsumer;
        this.objectMapper = objectMapper;
        this.tx = tx;
    }

    @RabbitListener(queues = QUEUE_ORDERS)
    public void on(EventEnvelope envelope) {
        String orderId = envelope.payload().path("orderId").asText(null);
        if (orderId == null || orderId.isBlank()) {
            log.error("Event {} thiếu payload.orderId — drop (poison shape)", envelope.eventId());
            return;
        }
        tx.executeWithoutResult(status -> {
            if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
                return; // re-delivery — đã xử lý
            }
            switch (envelope.eventType()) {
                case "order.paid" -> commit(orderId, envelope);
                case "order.cancelled", "order.failed" -> release(orderId, envelope);
                default -> log.warn("eventType không nhận (queue nhận nhầm routing key?): {}", envelope.eventType());
            }
        });
    }

    /** RESERVED → COMMITTED (stock đã trừ từ lúc reserve — giữ nguyên). */
    private void commit(String orderId, EventEnvelope envelope) {
        Reservation reservation = reservations
            .findFirstByOrderIdAndStatusOrderByCreatedAtDesc(orderId, ReservationStatus.RESERVED)
            .orElse(null);
        if (reservation == null) {
            log.warn("order.paid cho order {} nhưng không có reservation RESERVED (đã TTL release / re-delivery) — no-op", orderId);
            return;
        }
        if (reservations.transition(reservation.getId(), ReservationStatus.RESERVED, ReservationStatus.COMMITTED) != 1) {
            log.warn("order.paid cho order {} — reservation {} vừa đổi trạng thái (race) — no-op", orderId, reservation.getId());
            return;
        }
        outbox.write("inventory.committed", payload(reservation), envelope.correlationId());
        log.info("Reservation {} của order {} COMMITTED (order.paid)", reservation.getId(), orderId);
    }

    /** RESERVED → RELEASED (hoàn stock từng item). */
    private void release(String orderId, EventEnvelope envelope) {
        Reservation reservation = reservations
            .findFirstByOrderIdAndStatusOrderByCreatedAtDesc(orderId, ReservationStatus.RESERVED)
            .orElse(null);
        if (reservation == null) {
            log.warn("{} cho order {} nhưng không có reservation RESERVED — no-op", envelope.eventType(), orderId);
            return;
        }
        if (reservations.transition(reservation.getId(), ReservationStatus.RESERVED, ReservationStatus.RELEASED) != 1) {
            log.warn("{} cho order {} — reservation {} vừa đổi trạng thái (race) — no-op", envelope.eventType(), orderId, reservation.getId());
            return;
        }
        reservation.getItems().forEach(item -> stocks.restock(item.variantId(), item.qty()));
        outbox.write("inventory.released", payload(reservation), envelope.correlationId());
        log.info("Reservation {} của order {} RELEASED ({})", reservation.getId(), orderId, envelope.eventType());
    }

    /** Payload `inventory.committed|released` — items remap jsonb snake → camel (schema freeze). */
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
