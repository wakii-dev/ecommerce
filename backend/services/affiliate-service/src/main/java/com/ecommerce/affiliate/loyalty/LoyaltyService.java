package com.ecommerce.affiliate.loyalty;

import com.ecommerce.affiliate.loyalty.domain.LoyaltyAccount;
import com.ecommerce.affiliate.loyalty.domain.LoyaltyLedgerEntry;
import com.ecommerce.affiliate.loyalty.domain.LoyaltyLedgerType;
import com.ecommerce.affiliate.loyalty.repo.LoyaltyAccountRepository;
import com.ecommerce.affiliate.loyalty.repo.LoyaltyLedgerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/**
 * Sổ điểm loyalty (SF-14, D22) — file-slice {@code loyalty/}, cùng nhà ledger
 * hoa hồng (pattern LedgerService SF-12). Idempotency 2 lớp: marker eventId
 * (prefix {@code loyalty:} — queue riêng nên không đụng marker chung) +
 * UNIQUE(order_id, type) ở ledger.
 *
 * <p>Quy đổi (quyết định spec D3): earn
 * {@code points = floor(total × earnRate% / 100 / pointVnd)} — earnRate 1%,
 * pointVnd 100đ → total/10000 đúng pack. Burn: discount = points × pointVnd.
 * Reversal khi order terminal (D5): xoá entry EARN (thu hồi điểm) / REDEEM
 * (hoàn điểm) + cập nhật balance — idempotent qua existence check.</p>
 */
@Service
public class LoyaltyService {

    private static final Logger log = LoggerFactory.getLogger(LoyaltyService.class);
    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);

    private final LoyaltyAccountRepository accounts;
    private final LoyaltyLedgerRepository ledger;
    private final LoyaltyProperties props;

    public LoyaltyService(LoyaltyAccountRepository accounts, LoyaltyLedgerRepository ledger,
                          LoyaltyProperties props) {
        this.accounts = accounts;
        this.ledger = ledger;
        this.props = props;
    }

    // ── EARN (order.confirmed) ──────────────────────────────────────────────

    /** order.confirmed → cộng điểm 1 lần/đơn. total đã trừ coupon + điểm dùng. */
    @Transactional
    public void earn(String orderId, UUID userId, long orderTotal) {
        if (orderId == null || orderId.isBlank() || userId == null) {
            log.warn("order.confirmed thiếu orderId/userId — bỏ qua earn");
            return;
        }
        if (ledger.existsByOrderIdAndType(orderId, LoyaltyLedgerType.EARN)) {
            log.debug("Earn cho order {} đã tồn tại — skip (idempotent)", orderId);
            return;
        }
        long points = earnPoints(orderTotal);
        if (points <= 0) {
            log.debug("Order {} total {} → 0 điểm — không tạo entry", orderId, orderTotal);
            return;
        }
        accounts.upsertAccount(userId);
        ledger.save(new LoyaltyLedgerEntry(userId, orderId, LoyaltyLedgerType.EARN, points,
            "Earn " + props.earnRate() + "% đơn " + orderId));
        accounts.applyDelta(userId, points, points);
        log.info("Loyalty EARN +{} điểm cho user {} (order {}, total {})",
            points, userId, orderId, orderTotal);
    }

    // ── REDEEM (internal — ordering gọi lúc checkout) ───────────────────────

    public record RedeemResult(long discount, long remaining) {
    }

    /**
     * Trừ điểm NGUYÊN TỨC (guard balance) + ledger REDEEM (UNIQUE order →
     * double-redeem cùng đơn 409). Ném {@link InsufficientPointsException} /
     * {@link DuplicateRedeemException} cho controller map 409.
     */
    @Transactional
    public RedeemResult redeem(UUID userId, long points, String orderId) {
        if (points <= 0) {
            throw new IllegalArgumentException("Điểm dùng phải > 0");
        }
        if (ledger.existsByOrderIdAndType(orderId, LoyaltyLedgerType.REDEEM)) {
            throw new DuplicateRedeemException("Đơn " + orderId + " đã dùng điểm rồi");
        }
        int updated = accounts.redeemIfEnough(userId, points);
        if (updated == 0) {
            throw new InsufficientPointsException("Điểm không đủ (cần " + points + ")");
        }
        // Race 2 redeem song song cùng orderId: constraint UNIQUE ném ra →
        // tx rollback TOÀN BỘ (cả khoản trừ điểm) → 409, trạng thái sạch.
        ledger.save(new LoyaltyLedgerEntry(userId, orderId, LoyaltyLedgerType.REDEEM,
            -points, "Dùng điểm cho đơn " + orderId));
        long remaining = accounts.findByUserId(userId).map(LoyaltyAccount::getBalance).orElse(0L);
        log.info("Loyalty REDEEM {} điểm của user {} cho order {} (còn {})",
            points, userId, orderId, remaining);
        return new RedeemResult(points * props.pointVnd(), remaining);
    }

    // ── REVERSAL (order.cancelled / order.failed) ───────────────────────────

    /** Hoàn điểm REDEEM + thu hồi EARN của đơn terminal — idempotent. */
    @Transactional
    public void reverseOrder(String orderId) {
        if (orderId == null || orderId.isBlank()) {
            return;
        }
        ledger.findByOrderIdAndType(orderId, LoyaltyLedgerType.REDEEM).ifPresent(entry -> {
            long refund = Math.abs(entry.getPoints());
            ledger.delete(entry);
            accounts.applyDelta(entry.getUserId(), refund, 0);
            log.info("Loyalty hoàn {} điểm (order {} REDEEM thu hồi) cho user {}",
                refund, orderId, entry.getUserId());
        });
        ledger.findByOrderIdAndType(orderId, LoyaltyLedgerType.EARN).ifPresent(entry -> {
            long revoke = entry.getPoints();
            ledger.delete(entry);
            // Clamp 0 — điểm có thể đã bị tiêu vào đơn khác (repo revokeEarn)
            accounts.revokeEarn(entry.getUserId(), revoke);
            log.info("Loyalty thu hồi {} điểm earn (order {}) của user {}",
                revoke, orderId, entry.getUserId());
        });
    }

    // ── ADJUST (admin) + READ (me/admin tra cứu) ────────────────────────────

    /** Admin chỉnh tay — delta ± ; kết quả âm → {@link IllegalArgumentException}. */
    @Transactional
    public long adjust(UUID userId, long delta, String reason) {
        accounts.upsertAccount(userId);
        if (delta != 0) {
            LoyaltyAccount account = accounts.findByUserId(userId).orElseThrow();
            if (account.getBalance() + delta < 0) {
                throw new IllegalArgumentException(
                    "Điều chỉnh làm balance âm (" + account.getBalance() + " " + delta + ")");
            }
            ledger.save(new LoyaltyLedgerEntry(userId, null, LoyaltyLedgerType.ADJUST, delta,
                reason == null || reason.isBlank() ? "Admin adjust" : reason));
            accounts.applyDelta(userId, delta, 0);
        }
        return accounts.findByUserId(userId).orElseThrow().getBalance();
    }

    @Transactional(readOnly = true)
    public LoyaltyAccount accountOf(UUID userId) {
        return accounts.findByUserId(userId).orElseGet(() -> new LoyaltyAccount(userId));
    }

    @Transactional(readOnly = true)
    public Page<LoyaltyLedgerEntry> ledgerOf(UUID userId, int page, int size) {
        return ledger.findByUserIdOrderByCreatedAtDesc(userId,
            PageRequest.of(Math.max(0, page - 1), Math.min(size, 100)));
    }

    /** floor(total × rate% / 100 / pointVnd) — 1% + 100đ/điểm = total/10000. */
    public long earnPoints(long orderTotal) {
        return BigDecimal.valueOf(orderTotal)
            .multiply(BigDecimal.valueOf(props.earnRate()))
            .divide(ONE_HUNDRED.multiply(BigDecimal.valueOf(props.pointVnd())), 0, RoundingMode.FLOOR)
            .longValueExact();
    }

    /** Quy đổi điểm → VND (ordering cap effectivePoints dùng cùng pointVnd). */
    public long pointsToVnd(long points) {
        return points * props.pointVnd();
    }

    // ── Exceptions (controller map 409/400) ─────────────────────────────────

    public static class InsufficientPointsException extends RuntimeException {
        public InsufficientPointsException(String message) {
            super(message);
        }
    }

    public static class DuplicateRedeemException extends RuntimeException {
        public DuplicateRedeemException(String message) {
            super(message);
        }
    }
}
