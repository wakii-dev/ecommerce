/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/order.failed.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Saga thất bại — inventory release qua event này. Producer: ordering-service.
 */
export interface OrderFailed {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "order.failed";
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
     * Lý do thất bại (vd hết stock, coupon race)
     */
    reason: string;
    /**
     * Bước saga gãy: RESERVE (hết/tồn không đủ), PAYMENT (payment.failed), OTHER
     */
    stage: "RESERVE" | "PAYMENT" | "OTHER";
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
