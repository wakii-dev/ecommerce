package com.ecommerce.ordering.repo;

import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository
    extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {

    /** Replay Idempotency-Key: cùng (user, key) → đơn cũ (so payload_hash ở service). */
    Optional<Order> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    Optional<Order> findByIdAndUserId(UUID id, UUID userId);

    Page<Order> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** TTL sweeper (pack: PENDING quá 35' — safety net sau TTL inventory 30'). */
    List<Order> findByStatusAndCreatedAtBefore(OrderStatus status, Instant before,
                                               org.springframework.data.domain.Limit limit);

    /** Đếm PENDING quá hạn — sweeper bỏ poll khi 0 (giữ log sạch trong IT/dev). */
    long countByStatusAndCreatedAtBefore(OrderStatus status, Instant before);

    /**
     * Khóa row đơn khi cấp số hóa đơn (D18) — serialize 2 request tải PDF
     * CÙNG đơn: không cấp 2 số (không lỗ số), "cùng đơn → cùng số HĐ".
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.id = :id")
    Optional<Order> findWithWriteLock(@Param("id") UUID id);

    // ── Admin stats (§6.1.8 — SQL aggregate, read-only) ─────────────────────

    /** Doanh thu theo ngày — chỉ đơn đã trả tiền (revenueCounted). */
    @Query(value = """
        SELECT created_at::date AS day,
               COALESCE(SUM(total), 0) AS revenue,
               COUNT(*) AS orders
        FROM orders
        WHERE status IN ('PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED')
          AND created_at >= :from AND created_at < :to
        GROUP BY 1 ORDER BY 1
        """, nativeQuery = true)
    List<RevenueByDayView> revenueByDay(@Param("from") Instant from, @Param("to") Instant to);

    /** Counts theo status + doanh thu tổng/hôm nay — MỘT query quét 1 lần. */
    @Query(value = """
        SELECT COUNT(*) FILTER (WHERE status = 'PENDING')    AS pending,
               COUNT(*) FILTER (WHERE status = 'PAID')       AS paid,
               COUNT(*) FILTER (WHERE status = 'CONFIRMED')  AS confirmed,
               COUNT(*) FILTER (WHERE status = 'SHIPPED')    AS shipped,
               COUNT(*) FILTER (WHERE status = 'DELIVERED')  AS delivered,
               COUNT(*) FILTER (WHERE status = 'CANCELLED')  AS cancelled,
               COUNT(*) FILTER (WHERE status = 'FAILED')     AS failed,
               COALESCE(SUM(total) FILTER (WHERE status IN ('PAID','CONFIRMED','SHIPPED','DELIVERED')), 0) AS totalRevenue,
               COALESCE(SUM(total) FILTER (WHERE status IN ('PAID','CONFIRMED','SHIPPED','DELIVERED')
                                             AND created_at >= :dayStart), 0) AS todayRevenue,
               COUNT(*) FILTER (WHERE created_at >= :dayStart) AS todayOrders
        FROM orders
        """, nativeQuery = true)
    OrdersSummaryView ordersSummary(@Param("dayStart") Instant dayStart);

    /** Top sản phẩm bán chạy theo qty — join order_items, lọc khoảng thời gian. */
    @Query(value = """
        SELECT oi.product_id AS "productId",
               MAX(oi.name) AS name,
               SUM(oi.qty) AS qty,
               SUM(oi.line_total) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN ('PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED')
          AND o.created_at >= :from AND o.created_at < :to
        GROUP BY oi.product_id
        ORDER BY qty DESC
        LIMIT :limit
        """, nativeQuery = true)
    List<TopProductView> topProducts(@Param("from") Instant from, @Param("to") Instant to,
                                     @Param("limit") int limit);

    /** Projection — alias khớp cột native query (snake → camel qua quote). */
    interface RevenueByDayView {
        java.time.LocalDate getDay();

        long getRevenue();

        long getOrders();
    }

    interface OrdersSummaryView {
        long getPending();

        long getPaid();

        long getConfirmed();

        long getShipped();

        long getDelivered();

        long getCancelled();

        long getFailed();

        long getTotalRevenue();

        long getTodayRevenue();

        long getTodayOrders();
    }

    interface TopProductView {
        UUID getProductId();

        String getName();

        long getQty();

        long getRevenue();
    }
}
