/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/inventory.committed.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Trừ tồn chính thức khi order PAID (commit reservation). Producer: inventory-service. Kích hoạt qua event order.paid — không qua REST.
 */
export interface InventoryCommitted {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "inventory.committed";
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
    /**
     * Id reservation đã commit
     */
    reservationId: string;
    orderId: string;
    /**
     * @minItems 1
     */
    items: [
      {
        /**
         * Reservation ở mức variant (không phải product)
         */
        variantId: string;
        qty: number;
        [k: string]: unknown;
      },
      ...{
        /**
         * Reservation ở mức variant (không phải product)
         */
        variantId: string;
        qty: number;
        [k: string]: unknown;
      }[]
    ];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
