/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/inventory.reserved.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Reservation all-or-nothing thành công (variant-level, TTL mặc định 30'). Publish ra broker cho các consumer cần biết. Producer: inventory-service. Commit/release KHÔNG qua REST — điều khiển qua order.paid / order.cancelled / order.failed.
 */
export interface InventoryReserved {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "inventory.reserved";
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
     * Id reservation (dùng để release/commit khớp)
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
