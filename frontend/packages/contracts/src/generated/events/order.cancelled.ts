/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/order.cancelled.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Đơn bị hủy (user/admin qua TTL 30' — SYSTEM). Inventory release qua event này; nếu đã PAID thì refund kèm theo (server lo, flag refunded). Producer: ordering-service.
 */
export interface OrderCancelled {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "order.cancelled";
  /**
   * Thời điểm sự kiện xảy ra (UTC, ISO 8601)
   */
  occurredAt: string;
  /**
   * Truyền từ header X-Request-Id của gateway
   */
  correlationId: string;
  /**
   * Tên service phát event
   */
  producer: string;
  /**
   * Phiên bản payload schema — additive-only
   */
  schemaVersion: number;
  payload: {
    orderId: string;
    /**
     * Lý do hủy (text tự do / mã nội bộ)
     */
    reason: string;
    /**
     * SYSTEM = TTL 30' không thanh toán
     */
    cancelledBy: "USER" | "ADMIN" | "SYSTEM";
    /**
     * Optional — true khi đã PAID và refund đã khởi tạo (PAID/CONFIRMED → CANCELLED kèm refund)
     */
    refunded?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
