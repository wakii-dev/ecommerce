/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/payment.succeeded.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Payment intent thành công (Stripe webhook xác nhận). Producer: payment-service.
 */
export interface PaymentSucceeded {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "payment.succeeded";
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
     * pi_... của Stripe (hoặc adapter tương ứng)
     */
    paymentIntentId: string;
    /**
     * Số tiền VND nguyên (zero-decimal)
     */
    amount: number;
    currency: string;
    /**
     * null khi succeeded — giữ chung shape với payment.failed
     */
    failureReason?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
