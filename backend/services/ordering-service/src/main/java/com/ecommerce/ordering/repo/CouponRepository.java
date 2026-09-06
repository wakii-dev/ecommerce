package com.ecommerce.ordering.repo;

import com.ecommerce.ordering.domain.Coupon;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CouponRepository extends JpaRepository<Coupon, String> {

    Optional<Coupon> findByCode(String code);

    /** Coupon center (contract: chỉ coupon đang chạy, KHÔNG lộ usage-limit/used-count). */
    @Query("SELECT c FROM Coupon c WHERE c.active = true AND c.startsAt <= :now "
        + "AND (c.endsAt IS NULL OR c.endsAt >= :now) ORDER BY c.code")
    List<Coupon> findRunning(@Param("now") Instant now);

    /**
     * Reserve usage NGUYÊN TỬ (§6.1.3): guarded UPDATE tăng used_count CHỈ khi
     * coupon đang chạy + còn limit. Rowcount 0 = hết hạn/hết limit/inactive —
     * 2 đơn song song cùng vượt limit thì ĐÚNG 1 thắng (điều kiện dùng
     * used_count đọc trong cùng statement, không TOCTOU).
     */
    @Modifying
    @Query("UPDATE Coupon c SET c.usedCount = c.usedCount + 1 WHERE c.code = :code "
        + "AND c.active = true AND c.startsAt <= :now "
        + "AND (c.endsAt IS NULL OR c.endsAt >= :now) "
        + "AND (c.usageLimit IS NULL OR c.usedCount < c.usageLimit)")
    int reserveUsage(@Param("code") String code, @Param("now") Instant now);

    /**
     * Release (đơn FAILED/CANCELLED): guarded — chỉ khi còn reservation
     * RESERVED tương ứng (caller rowcount-gate qua CouponReservationRepository
     * rồi mới gọi đây; guard used_count > 0 chống đếm âm).
     */
    @Modifying
    @Query("UPDATE Coupon c SET c.usedCount = c.usedCount - 1 WHERE c.code = :code AND c.usedCount > 0")
    int releaseUsage(@Param("code") String code);

    /**
     * Finalize — hiện tại không đổi gì trên coupons (used_count đã tính lúc
     * reserve); giữ hook rõ nghĩa cho chính sách đếm sau (vd chỉ đếm đơn
     * CONFIRMED) không phải đổi call-site.
     */
    @Lock(LockModeType.NONE)
    @Query("SELECT c FROM Coupon c WHERE c.code = :code")
    Optional<Coupon> forFinalize(@Param("code") String code);
}
