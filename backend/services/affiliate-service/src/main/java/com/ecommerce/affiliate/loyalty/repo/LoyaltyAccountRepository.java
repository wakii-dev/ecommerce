package com.ecommerce.affiliate.loyalty.repo;

import com.ecommerce.affiliate.loyalty.domain.LoyaltyAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface LoyaltyAccountRepository extends JpaRepository<LoyaltyAccount, UUID> {

    Optional<LoyaltyAccount> findByUserId(UUID userId);

    /** Lazy upsert account — earn/adjust lần đầu tạo row balance 0 (idempotent). */
    @Modifying
    @Query(value = """
        INSERT INTO loyalty_accounts (user_id, balance, total_earned, updated_at)
        VALUES (:userId, 0, 0, now())
        ON CONFLICT (user_id) DO NOTHING
        """, nativeQuery = true)
    void upsertAccount(@Param("userId") UUID userId);

    /** Cộng/trừ delta (REDEEM hoàn/ADJUST sau khi guard riêng đã đảm bảo ≥0). */
    @Modifying
    @Query("""
        UPDATE LoyaltyAccount a
        SET a.balance = a.balance + :balanceDelta,
            a.totalEarned = a.totalEarned + :earnedDelta,
            a.updatedAt = CURRENT_TIMESTAMP
        WHERE a.userId = :userId
        """)
    int applyDelta(@Param("userId") UUID userId,
                   @Param("balanceDelta") long balanceDelta,
                   @Param("earnedDelta") long earnedDelta);

    /**
     * REDEEM nguyên tử (pack: "trừ điểm nguyên tử, reserve kiểu coupon") —
     * chỉ trừ khi đủ; rowcount 0 = thiếu điểm → caller 409. Concurrent an toàn:
     * 2 redeem cùng lúc, chỉ cái đủ balance thắng.
     */
    @Modifying
    @Query(value = """
        UPDATE loyalty_accounts
        SET balance = balance - :points, updated_at = now()
        WHERE user_id = :userId AND balance >= :points
        """, nativeQuery = true)
    int redeemIfEnough(@Param("userId") UUID userId, @Param("points") long points);

    /**
     * Thu hồi điểm earn khi đơn cancel SAU khi đã CONFIRMED — clamp tại 0:
     * user có thể đã tiêu điểm đó vào đơn khác (không đuổi theo nợ điểm).
     * total_earned vẫn trừ đủ (thống kê phản ánh đúng đơn hủy).
     */
    @Modifying
    @Query(value = """
        UPDATE loyalty_accounts
        SET balance = GREATEST(0, balance - :points), total_earned = total_earned - :points,
            updated_at = now()
        WHERE user_id = :userId
        """, nativeQuery = true)
    int revokeEarn(@Param("userId") UUID userId, @Param("points") long points);
}
