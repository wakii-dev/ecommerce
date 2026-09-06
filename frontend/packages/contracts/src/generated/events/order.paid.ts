/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/order.paid.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Đơn đã thanh toán — inventory commit reservation qua event này; COD không phát event này (CONFIRMED sau reserve, PAID lúc giao). Producer: ordering-service.
 */
export interface OrderPaid {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "order.paid";
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
     * Intent đã capture thành công
     */
    paymentIntentId: string;
    paidAt: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
