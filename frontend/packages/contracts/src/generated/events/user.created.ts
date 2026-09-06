/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/user.created.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * Phát khi user đăng ký (hoặc OAuth find-or-create) thành công. Producer: identity-service.
 */
export interface UserCreated {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "user.created";
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
     * Id user (identity)
     */
    userId: string;
    email: string;
    fullName: string;
    /**
     * vd [CUSTOMER] hoặc [CUSTOMER, ADMIN]
     */
    roles: string[];
    createdAt: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
