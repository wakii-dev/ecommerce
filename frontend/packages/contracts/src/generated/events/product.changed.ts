/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/product.changed.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Phát khi product tạo/sửa/xóa — ES indexer index theo slug per-locale + invalidate cache catalog. Producer: catalog-service.
 */
export interface ProductChanged {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "product.changed";
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
    productId: string;
    /**
     * DELETED → indexer xóa doc + cache invalidate; không kèm dữ liệu sản phẩm
     */
    action: "CREATED" | "UPDATED" | "DELETED";
    /**
     * Slug tiếng Việt (ES index per-locale)
     */
    slugVi: string;
    /**
     * Slug tiếng Anh (ES index per-locale)
     */
    slugEn: string;
    changedAt: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
