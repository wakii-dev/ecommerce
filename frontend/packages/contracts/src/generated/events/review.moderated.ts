/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/review.moderated.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Admin duyệt/từ chối review — catalog cập nhật rating_avg denormalized của product. Producer: catalog-service.
 */
export interface ReviewModerated {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "review.moderated";
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
    reviewId: string;
    /**
     * Consumer cập nhật rating_avg denormalized theo productId
     */
    productId: string;
    /**
     * Người viết review (để notification gửi kết quả)
     */
    userId: string;
    status: "APPROVED" | "REJECTED";
    rating: number;
    moderatedAt: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
