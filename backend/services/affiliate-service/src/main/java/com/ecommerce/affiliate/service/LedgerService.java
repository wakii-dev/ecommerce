package com.ecommerce.affiliate.service;

import com.ecommerce.affiliate.api.dto.AffiliateDtos.AdminStatsResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.StatsResponse;
import com.ecommerce.affiliate.config.AffiliateProperties;
import com.ecommerce.affiliate.domain.Affiliate;
import com.ecommerce.affiliate.domain.LedgerEntry;
import com.ecommerce.affiliate.domain.LedgerStatus;
import com.ecommerce.affiliate.repo.AffiliateRepository;
import com.ecommerce.affiliate.repo.ClickRepository;
import com.ecommerce.affiliate.repo.LedgerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Sổ hoa hồng (D20): consume {@code order.confirmed} (fat payload có
 * {@code affiliateCode} nullable) → entry PENDING với
 * {@code commission = floor(order_total × rate / 100)} (VND làm tròn XUỐNG —
 * §6.1.3 analogy). {@code rate} chốt tại thời điểm CONFIRMED — ledger cũ giữ
 * rate cũ dù admin đổi sau (contract). Order cancel/fail sau khi tạo (race)
 * → gỡ entry CHƯA CONFIRMED theo orderId.
 *
 * <p>Idempotency 2 lớp: marker eventId (IdempotentConsumer ở consumer) +
 * {@code order_id UNIQUE} ở đây — re-delivery không double-entry.</p>
 */
@Service
public class LedgerService {

    private static final Logger log = LoggerFactory.getLogger(LedgerService.class);
    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);

    private final LedgerRepository ledger;
    private final AffiliateRepository affiliates;
    private final ClickRepository clicks;
    private final AffiliateProperties props;

    public LedgerService(LedgerRepository ledger, AffiliateRepository affiliates,
                         ClickRepository clicks, AffiliateProperties props) {
        this.ledger = ledger;
        this.affiliates = affiliates;
        this.clicks = clicks;
        this.props = props;
    }

    /**
     * order.confirmed → tạo ledger entry nếu đơn có mã affiliate hợp lệ
     * (affiliate vẫn APPROVED lúc confirm). Code lạ / affiliate không ACTIVE
     * → skip im lặng (acceptance: link không hợp lệ → không tracking, không lỗi).
     */
    @Transactional
    public void onOrderConfirmed(String orderId, long orderTotal, String affiliateCode) {
        if (orderId == null || orderId.isBlank()) {
            log.warn("order.confirmed thiếu orderId — bỏ qua");
            return;
        }
        if (affiliateCode == null || affiliateCode.isBlank()) {
            return;   // đơn thường không qua affiliate — đường chính, không log
        }
        if (ledger.findByOrderId(orderId).isPresent()) {
            log.debug("Ledger cho order {} đã tồn tại — skip (idempotent)", orderId);
            return;
        }
        Affiliate affiliate = affiliates.findByCode(affiliateCode).orElse(null);
        if (affiliate == null || !affiliate.isApproved()) {
            log.info("affiliateCode {} không thuộc affiliate APPROVED — order {} không tính hoa hồng",
                affiliateCode, orderId);
            return;
        }
        BigDecimal rate = affiliate.effectiveRate(props.getDefaultRate());
        long commission = commissionOf(orderTotal, rate);
        ledger.save(new LedgerEntry(affiliate.getId(), orderId, orderTotal, rate, commission));
        log.info("Ledger +1: order {} total {} × {}% = {}₫ cho affiliate {}",
            orderId, orderTotal, rate, commission, affiliate.getCode());
    }

    /** order.cancelled / order.failed → gỡ entry PENDING của order đó (race đảo). */
    @Transactional
    public void onOrderTerminal(String orderId) {
        if (orderId == null || orderId.isBlank()) {
            return;
        }
        long removed = ledger.deleteByOrderIdAndStatus(orderId, LedgerStatus.PENDING);
        if (removed > 0) {
            log.info("Order {} terminal — gỡ {} ledger entry chưa CONFIRMED", orderId, removed);
        }
    }

    /** floor(order_total × rate / 100) — VND làm tròn xuống. */
    public static long commissionOf(long orderTotal, BigDecimal rate) {
        return BigDecimal.valueOf(orderTotal)
            .multiply(rate)
            .divide(ONE_HUNDRED, 0, RoundingMode.FLOOR)
            .longValueExact();
    }

    /** Stats của 1 affiliate (contract AffiliateStats): clicks/conversions/earnings tổng. */
    @Transactional(readOnly = true)
    public StatsResponse statsOf(Affiliate affiliate) {
        int clickCount = affiliate.getCode() == null ? 0 : (int) clicks.countByCode(affiliate.getCode());
        int conversions = (int) ledger.countByAffiliateId(affiliate.getId());
        long earnings = ledger.sumCommissionByAffiliateId(affiliate.getId());
        return new StatsResponse(clickCount, conversions, earnings);
    }

    /** Stats admin (contract /admin/stats) — from/to inclusive theo ngày local (UTC). */
    @Transactional(readOnly = true)
    public AdminStatsResponse adminStats(LocalDate from, LocalDate to) {
        Instant start = from != null ? from.atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.EPOCH;
        Instant end = to != null
            ? to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().minusMillis(1)
            : Instant.now();
        long totalAffiliates = affiliates.countByCreatedAtBetween(start, end);
        long activeClicks = clicks.countByOccurredAtBetween(start, end);
        long conversions = ledger.countByCreatedAtBetween(start, end);
        long totalCommission = ledger.sumCommissionBetween(start, end);
        return new AdminStatsResponse(totalAffiliates, activeClicks, conversions, totalCommission);
    }
}
