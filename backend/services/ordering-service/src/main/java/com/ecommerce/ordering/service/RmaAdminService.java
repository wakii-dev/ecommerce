package com.ecommerce.ordering.service;

import com.ecommerce.ordering.api.InvalidStateTransitionException;
import com.ecommerce.ordering.api.PaymentUnavailableException;
import com.ecommerce.ordering.api.dto.RmaDtos.RmaDto;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.Rma;
import com.ecommerce.ordering.domain.RmaStatus;
import com.ecommerce.ordering.repo.OrderRepository;
import com.ecommerce.ordering.repo.RmaRepository;
import com.ecommerce.ordering.saga.PaymentClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Admin RMA queue (SF-14, D22): duyệt/từ chối REQUESTED, nhận hàng APPROVED,
 * hoàn tiền RECEIVED (terminal REFUNDED). Refund theo quyết định spec:
 *
 * <ul>
 *   <li><strong>D2 double-refund guard</strong> — đơn đã có RMA REFUNDED khác
 *       → 409 (refund MVP là FULL đơn; 2 RMA cùng đơn không được trừ 2 lần).</li>
 *   <li>Đơn stripe → payment-service refund (key idempotent
 *       {@code rma-refund:<rmaId>} — 409 từ payment = đã hoàn rồi, coi như xong);
 *       lỗi khác → 502, RMA giữ RECEIVED để retry.</li>
 *   <li>Đơn COD / không có intent → hoàn OFFLINE (mark REFUNDED + log) — D1.</li>
 * </ul>
 *
 * Mỗi transition outbox {@code rma.<status>} payload FAT (email từ Order — D6).
 */
@Service
public class RmaAdminService {

    private static final Logger log = LoggerFactory.getLogger(RmaAdminService.class);
    private static final int MAX_PAGE_SIZE = 100;

    private final RmaRepository rmas;
    private final OrderRepository orders;
    private final PaymentClient payment;
    private final RmaService rmaService;
    private final TransactionTemplate tx;

    public RmaAdminService(RmaRepository rmas, OrderRepository orders, PaymentClient payment,
                           RmaService rmaService, TransactionTemplate tx) {
        this.rmas = rmas;
        this.orders = orders;
        this.payment = payment;
        this.rmaService = rmaService;
        this.tx = tx;
    }

    public Page<RmaDto> list(RmaStatus status, int page, int size) {
        Page<Rma> result = status == null
            ? rmas.findAllByOrderByCreatedAtDesc(PageRequest.of(Math.max(0, page - 1),
                Math.min(size, MAX_PAGE_SIZE), Sort.by(Sort.Direction.DESC, "createdAt")))
            : rmas.findByStatusOrderByCreatedAtDesc(status, PageRequest.of(Math.max(0, page - 1),
                Math.min(size, MAX_PAGE_SIZE), Sort.by(Sort.Direction.DESC, "createdAt")));
        return result.map(RmaDto::from);
    }

    public RmaDto approve(UUID id) {
        return transition(id, RmaStatus.APPROVED);
    }

    public RmaDto reject(UUID id) {
        return transition(id, RmaStatus.REJECTED);
    }

    public RmaDto markReceived(UUID id) {
        return transition(id, RmaStatus.RECEIVED);
    }

    /** POST /admin/rma/{id}/refund — RECEIVED → REFUNDED (terminal, contract). */
    public RmaDto refund(UUID id) {
        Rma rma = rmas.findById(id)
            .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException("Không tìm thấy RMA"));
        requireTransition(rma.getStatus(), RmaStatus.REFUNDED);
        Order order = orders.findById(rma.getOrderId())
            .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException("Không tìm thấy đơn của RMA"));
        if (rmas.existsByOrderIdAndStatus(order.getId(), RmaStatus.REFUNDED)) {
            throw new InvalidStateTransitionException(
                "Đơn này đã hoàn tiền qua một yêu cầu trả hàng khác — không hoàn lần 2");
        }

        long amount = order.getTotal();
        boolean stripe = order.getStripeIntentId() != null;
        if (stripe) {
            refundViaStripe(order, rma.getId());
        }

        Rma saved;
        try {
            saved = tx.execute(status -> {
                Rma fresh = rmas.findById(rma.getId()).orElseThrow();
                requireTransition(fresh.getStatus(), RmaStatus.REFUNDED);
                // Re-check guard TRONG tx (review P1 — TOCTOU: check trước tx không đủ)
                if (rmas.existsByOrderIdAndStatus(order.getId(), RmaStatus.REFUNDED)) {
                    throw new InvalidStateTransitionException(
                        "Đơn này đã hoàn tiền qua một yêu cầu trả hàng khác — không hoàn lần 2");
                }
                fresh.transitionTo(RmaStatus.REFUNDED);
                // COD offline cũng ghi full amount (review P2 — đồng bộ event/email/FE)
                fresh.markRefunded(amount);
                rmas.save(fresh);
                rmaService.writeTransitionEvent(fresh, order, RmaStatus.REFUNDED, amount, "admin:" + fresh.getId());
                return fresh;
            });
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // uq_rma_refunded_per_order (V13): 2 refund race cùng đơn — DB là authority
            throw new InvalidStateTransitionException(
                "Đơn này đã hoàn tiền qua một yêu cầu trả hàng khác — không hoàn lần 2");
        }
        log.info("RMA {} REFUNDED {}đ (order={}, mode={})",
            rma.getId(), amount, order.getId(), stripe ? "stripe" : "offline-cod");
        return RmaDto.from(saved);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /** REQUESTED→APPROVED/REJECTED · APPROVED→RECEIVED — guard + tx + event. */
    private RmaDto transition(UUID id, RmaStatus target) {
        Rma saved = tx.execute(status -> {
            Rma rma = rmas.findById(id)
                .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException("Không tìm thấy RMA"));
            requireTransition(rma.getStatus(), target);
            rma.transitionTo(target);
            rmas.save(rma);
            Order order = orders.findById(rma.getOrderId()).orElse(null);
            if (order != null) {
                rmaService.writeTransitionEvent(rma, order, target, null, "admin:" + rma.getId());
            }
            return rma;
        });
        log.info("RMA {} → {} (admin)", id, target);
        return RmaDto.from(saved);
    }

    private void requireTransition(RmaStatus from, RmaStatus target) {
        if (!from.canTransitionTo(target)) {
            throw new InvalidStateTransitionException(
                "RMA đang " + from + " — không chuyển sang " + target + " được");
        }
    }

    /**
     * Refund NGOÀI tx (pattern cancelByAdmin): 409 = đã hoàn (retry crash) →
     * tiếp tục; lỗi khác → 502 PaymentUnavailableException — RMA giữ RECEIVED.
     */
    private void refundViaStripe(Order order, UUID rmaId) {
        try {
            payment.refund(order.getStripeIntentId(), "rma_refund",
                UUID.nameUUIDFromBytes(("rma-refund:" + rmaId).getBytes(StandardCharsets.UTF_8)));
        } catch (HttpClientErrorException.Conflict e) {
            log.info("Refund RMA {} đã tồn tại trên payment — tiếp tục", rmaId);
        } catch (RestClientException e) {
            throw new PaymentUnavailableException(
                "Refund thất bại cho RMA " + rmaId + ": " + e.getMessage());
        }
    }
}
