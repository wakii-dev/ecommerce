package com.ecommerce.ordering.service;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.ordering.api.InvalidRmaLinesException;
import com.ecommerce.ordering.api.InvalidStateTransitionException;
import com.ecommerce.ordering.api.RmaWindowException;
import com.ecommerce.ordering.api.dto.RmaDtos.RmaCreateRequest;
import com.ecommerce.ordering.api.dto.RmaDtos.RmaDto;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderItem;
import com.ecommerce.ordering.domain.OrderStatus;
import com.ecommerce.ordering.domain.Rma;
import com.ecommerce.ordering.domain.RmaLine;
import com.ecommerce.ordering.domain.RmaStatus;
import com.ecommerce.ordering.repo.OrderRepository;
import com.ecommerce.ordering.repo.RmaRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * RMA đổi trả (SF-14, D22) — customer path: tạo trên đơn DELIVERED trong cửa
 * sổ {@code RMA_WINDOW_DAYS} (default 7) kể từ lần DELIVERED cuối (timeline),
 * list của tôi. Quyết định spec D6: outbox {@code rma.*} payload FAT mang
 * email từ Order — notification KHÔNG call-back.
 */
@Service
public class RmaService {

    private static final Logger log = LoggerFactory.getLogger(RmaService.class);
    private static final int MAX_PAGE_SIZE = 100;

    private final RmaRepository rmas;
    private final OrderRepository orders;
    private final OutboxWriter outbox;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;
    private final long windowDays;

    public RmaService(RmaRepository rmas, OrderRepository orders, OutboxWriter outbox,
                      ObjectMapper objectMapper, TransactionTemplate tx,
                      @Value("${ordering.rma.window-days:7}") long windowDays) {
        this.rmas = rmas;
        this.orders = orders;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
        this.tx = tx;
        this.windowDays = windowDays;
    }

    /**
     * POST /me/rma → REQUESTED (202). Guards đúng contract createRma:
     * đơn không thuộc user → 404; chưa DELIVERED → 409; quá cửa sổ → 409;
     * lines không khớp order_items → 400.
     */
    public RmaDto create(UUID userId, RmaCreateRequest request) {
        Order order = orders.findByIdAndUserId(request.orderId(), userId)
            .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException("Không tìm thấy đơn"));
        if (order.getStatus() != OrderStatus.DELIVERED) {
            throw new InvalidStateTransitionException(
                "Chỉ đơn DELIVERED mới tạo yêu cầu trả hàng được — đơn đang " + order.getStatus());
        }
        Instant deliveredAt = lastDeliveredAt(order);
        if (deliveredAt == null) {
            // review P2: đơn DELIVERED nhưng timeline thiếu entry (degenerate data)
            // → không tính được cửa sổ → chặn defensively, không mở lối bỏ qua
            throw new RmaWindowException(
                "Đơn không có mốc giao hàng — không thể tạo yêu cầu trả/đổi");
        }
        if (Instant.now().isAfter(deliveredAt.plus(Duration.ofDays(windowDays)))) {
            throw new RmaWindowException(
                "Đã quá " + windowDays + " ngày kể từ khi giao hàng — hết hạn tạo yêu cầu trả/đổi");
        }
        List<RmaLine> lines = validateLines(order, request.lines());

        Rma saved = tx.execute(status -> {
            Rma rma = new Rma(order.getId(), userId, request.reason().trim(), lines);
            rmas.save(rma);
            outbox.write("rma.requested", payload(rma, order, null), "user:" + userId);
            return rma;
        });
        log.info("RMA {} REQUESTED cho order {} (user={}, {} lines)",
            saved.getId(), order.getId(), userId, lines.size());
        return RmaDto.from(saved);
    }

    /** GET /me/rma — mới nhất trước (contract listMyRmas). */
    public Page<RmaDto> listMine(UUID userId, int page, int size) {
        return rmas.findByUserIdOrderByCreatedAtDesc(userId,
                PageRequest.of(Math.max(0, page - 1), Math.min(size, MAX_PAGE_SIZE)))
            .map(RmaDto::from);
    }

    /** GET /me/orders/{id} dùng — RMA của 1 đơn (chủ đơn đã check ở caller). */
    public List<RmaDto> listByOrder(UUID orderId) {
        return rmas.findByOrderIdOrderByCreatedAtDesc(orderId).stream()
            .map(RmaDto::from)
            .toList();
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private Instant lastDeliveredAt(Order order) {
        return order.getTimeline().stream()
            .filter(t -> t.status() == OrderStatus.DELIVERED)
            .map(t -> t.at())
            .max(Instant::compareTo)
            .orElse(null);
    }

    /** lineId phải là OrderItem của đơn, 1 ≤ qty ≤ line qty (contract RmaLine). */
    private List<RmaLine> validateLines(Order order, List<RmaCreateRequest.Line> lines) {
        Map<UUID, OrderItem> byId = order.getItems().stream()
            .collect(Collectors.toMap(OrderItem::getId, Function.identity()));
        List<RmaLine> result = new ArrayList<>();
        for (RmaCreateRequest.Line line : lines) {
            OrderItem item = byId.get(line.lineId());
            if (item == null) {
                throw new InvalidRmaLinesException(
                    "Dòng hàng " + line.lineId() + " không thuộc đơn này");
            }
            if (line.qty() < 1 || line.qty() > item.getQty()) {
                throw new InvalidRmaLinesException(
                    "Số lượng trả cho " + item.getName() + " phải từ 1 đến " + item.getQty());
            }
            result.add(new RmaLine(item.getId().toString(), line.qty()));
        }
        return result;
    }

    /** Payload FAT rma.* — notification gửi email ngay, không call-back (D6). */
    private ObjectNode payload(Rma rma, Order order, Long refundAmount) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("rmaId", rma.getId().toString());
        payload.put("orderId", order.getId().toString());
        payload.put("userId", order.getUserId().toString());
        payload.put("email", order.getEmail());
        payload.put("status", rma.getStatus().name());
        payload.put("reason", rma.getReason());
        ArrayNode lines = payload.putArray("lines");
        rma.getItems().forEach(l -> {
            ObjectNode line = lines.addObject();
            line.put("lineId", l.lineId());
            line.put("qty", l.qty());
        });
        if (refundAmount != null) {
            payload.put("refundAmount", refundAmount);
        }
        payload.put("occurredAt", Instant.now().toString());
        return payload;
    }

    /** Cho admin service (T3) reuse — payload FAT + event sau transition. */
    void writeTransitionEvent(Rma rma, Order order, RmaStatus target, Long refundAmount,
                              String correlationId) {
        outbox.write("rma." + target.name().toLowerCase(java.util.Locale.ROOT),
            payload(rma, order, refundAmount), correlationId);
    }
}
