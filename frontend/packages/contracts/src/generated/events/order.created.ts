/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/order.created.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Đơn vừa tạo (PENDING) — ordering-service phát sau khi persist + reservation. Producer: ordering-service.
 */
export interface OrderCreated {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "order.created";
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
    userId: string;
    /**
     * Mirror enum order status §3.6 — tại thời điểm phát là PENDING
     */
    status: "PENDING" | "PAID" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "FAILED";
    /**
     * Tổng tiền VND nguyên
     */
    total: number;
    createdAt: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
