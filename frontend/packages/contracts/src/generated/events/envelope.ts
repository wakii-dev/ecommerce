/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/envelope.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Envelope chung cho mọi event trên exchange topic 'ecommerce.events'. Mỗi event schema tự chứa (không $ref liên file) vì json-schema-to-typescript không resolve ref liên file — chấp nhận lặp, xem README.
 */
export interface Envelope {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event> — domain trùng tên service sở hữu event
   */
  eventType: string;
  /**
   * Thời điểm sự kiện xảy ra (UTC, ISO 8601)
   */
  occurredAt: string;
  /**
   * Truyền từ header X-Request-Id của gateway — nối chuỗi các event cùng 1 request
   */
  correlationId: string;
  /**
   * Tên service phát event (vd identity-service, ordering-service)
   */
  producer: string;
  /**
   * Phiên bản payload schema — tăng khi thêm field (additive-only)
   */
  schemaVersion: number;
  /**
   * Nội dung riêng từng event — xem file <eventType>.schema.json
   */
  payload: {
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
