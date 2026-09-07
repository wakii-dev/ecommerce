package com.ecommerce.ordering;

import com.ecommerce.ordering.domain.Coupon;
import com.ecommerce.ordering.domain.CouponType;
import com.ecommerce.ordering.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test nhanh — guard state machine §3.6 + coupon math (floor §6.1.3).
 * Không container — policy thuần Java.
 */
class OrderStatusTest {

    @Test
    void goldenChain_pendingToPaidToConfirmedToShippedToDelivered() {
        assertThat(OrderStatus.PENDING.canTransitionTo(OrderStatus.PAID)).isTrue();
        assertThat(OrderStatus.PAID.canTransitionTo(OrderStatus.CONFIRMED)).isTrue();
        assertThat(OrderStatus.CONFIRMED.canTransitionTo(OrderStatus.SHIPPED)).isTrue();
        assertThat(OrderStatus.SHIPPED.canTransitionTo(OrderStatus.DELIVERED)).isTrue();
    }

    @Test
    void illegalTransitions_rejected() {
        // PENDING→CONFIRMED DUY NHẤT cho COD (SF-13/D21 — pack + ordering.yaml);
        // còn lại vẫn cấm nhảy cóc: PENDING→SHIPPED, PAID→SHIPPED
        assertThat(OrderStatus.PENDING.canTransitionTo(OrderStatus.SHIPPED)).isFalse();
        assertThat(OrderStatus.PAID.canTransitionTo(OrderStatus.SHIPPED)).isFalse();
        // Không hồi sinh terminal
        assertThat(OrderStatus.CANCELLED.canTransitionTo(OrderStatus.PENDING)).isFalse();
        assertThat(OrderStatus.FAILED.canTransitionTo(OrderStatus.PAID)).isFalse();
        assertThat(OrderStatus.DELIVERED.canTransitionTo(OrderStatus.CANCELLED)).isFalse();
    }

    @Test
    void compensationEdges_allowed() {
        // PENDING→FAILED (system), PENDING→CANCELLED (TTL/user/admin),
        // PAID/CONFIRMED→CANCELLED (admin kèm refund)
        assertThat(OrderStatus.PENDING.canTransitionTo(OrderStatus.FAILED)).isTrue();
        assertThat(OrderStatus.PENDING.canTransitionTo(OrderStatus.CANCELLED)).isTrue();
        assertThat(OrderStatus.PAID.canTransitionTo(OrderStatus.CANCELLED)).isTrue();
        assertThat(OrderStatus.CONFIRMED.canTransitionTo(OrderStatus.CANCELLED)).isTrue();
        // SHIPPED/DELIVERED KHÔNG cancel được
        assertThat(OrderStatus.SHIPPED.canTransitionTo(OrderStatus.CANCELLED)).isFalse();
        assertThat(OrderStatus.DELIVERED.canTransitionTo(OrderStatus.CANCELLED)).isFalse();
    }

    @Test
    void terminalAndRevenueClassification() {
        assertThat(OrderStatus.CANCELLED.isTerminal()).isTrue();
        assertThat(OrderStatus.FAILED.isTerminal()).isTrue();
        assertThat(OrderStatus.DELIVERED.isTerminal()).isTrue();
        assertThat(OrderStatus.CONFIRMED.isTerminal()).isFalse();

        assertThat(OrderStatus.PAID.revenueCounted()).isTrue();
        assertThat(OrderStatus.CONFIRMED.revenueCounted()).isTrue();
        assertThat(OrderStatus.PENDING.revenueCounted()).isFalse();
        assertThat(OrderStatus.FAILED.revenueCounted()).isFalse();

        assertThat(OrderStatus.CONFIRMED.invoiceAvailable()).isTrue();
        assertThat(OrderStatus.SHIPPED.invoiceAvailable()).isTrue();
        assertThat(OrderStatus.PAID.invoiceAvailable()).isFalse();
        assertThat(OrderStatus.CANCELLED.invoiceAvailable()).isFalse();
    }

    @Test
    void couponDiscount_percentFloorsDown_fixedCappedAtSubtotal() {
        Instant now = Instant.now();
        Coupon percent = new Coupon("P10", CouponType.PERCENT, 10, null, now.minusSeconds(60), null, null, "10%");
        // 10% của 82.999 = 8299.9 → floor 8299 (§6.1.3: % trên VND làm tròn XUỐNG)
        assertThat(percent.discountFor(82_999)).isEqualTo(8_299);
        // Discount không vượt subtotal (PERCENT 100%)
        Coupon full = new Coupon("FULL", CouponType.PERCENT, 100, null, now.minusSeconds(60), null, null, "100%");
        assertThat(full.discountFor(50_000)).isEqualTo(50_000);

        // FIXED trừ thẳng nhưng cap tại subtotal (không âm hóa đơn)
        Coupon fixed = new Coupon("F50K", CouponType.FIXED, 50_000, null, now.minusSeconds(60), null, 10, "50K");
        assertThat(fixed.discountFor(200_000)).isEqualTo(50_000);
        assertThat(fixed.discountFor(20_000)).isEqualTo(20_000);
    }

    @Test
    void couponWindow_checks() {
        Instant now = Instant.now();
        Coupon ended = new Coupon("OLD", CouponType.PERCENT, 10, null, now.minusSeconds(3600),
            now.minusSeconds(60), null, "hết hạn");
        assertThat(ended.isRunning(now)).isFalse();

        Coupon notStarted = new Coupon("NEW", CouponType.PERCENT, 10, null, now.plusSeconds(3600),
            null, null, "chưa mở");
        assertThat(notStarted.isRunning(now)).isFalse();

        Coupon running = new Coupon("RUN", CouponType.PERCENT, 10, null, now.minusSeconds(60),
            null, null, "đang chạy");
        assertThat(running.isRunning(now)).isTrue();
        assertThat(running.meetsMinOrder(1000)).isTrue();
    }
}
