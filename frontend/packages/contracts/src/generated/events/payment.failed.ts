/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/payment.failed.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Payment intent thất bại (bị từ chối / lỗi adapter). Producer: payment-service. Ordering nhận → order.failed stage PAYMENT.
 */
export interface PaymentFailed {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "payment.failed";
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
     * Số tiền VND nguyên (zero-decimal) — số tiền đã thử thu
     */
    amount: number;
    currency: string;
    /**
     * Optional — mã/lý do thất bại từ adapter (vd card_declined)
     */
    failureReason?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
