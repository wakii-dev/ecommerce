/* GENERATED — KHÔNG sửa tay.
 * Nguồn: contracts/events/order.confirmed.schema.json
 * Regenerate: pnpm --filter @ecommerce/contracts gen */

/**
 * FAT PAYLOAD (§6.1.5) — event quan trọng nhất chuỗi consumer: notification (email xác nhận), cart (xóa đã đặt), catalog (thống kê bán), log, partner, affiliate (tính hoa hồng). Payload ĐỦ dữ liệu cho MỌI consumer — CẤM consumer call-back HTTP để lấy field thiếu. Producer: ordering-service.
 */
export interface OrderConfirmed {
  /**
   * UUID v4 — consumer dùng dedupe (idempotent receive)
   */
  eventId: string;
  /**
   * Routing key dạng <domain>.<event>
   */
  eventType: "order.confirmed";
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
  /**
   * FAT — snapshot đủ dùng của đơn tại thời điểm CONFIRMED
   */
  payload: {
    orderId: string;
    userId: string;
    /**
     * Email nhận xác nhận — notification dùng ngay, không cần tra identity
     */
    email: string;
    /**
     * @minItems 1
     */
    items: [
      {
        productId: string;
        variantId: string;
        qty: number;
        /**
         * Đơn giá VND tại thời điểm đặt
         */
        price: number;
        /**
         * Tên sản phẩm đã resolve (R2 FI-312: notification cần cho email xác nhận — contract cấm consumer call-back HTTP)
         */
        name?: string;
        [k: string]: unknown;
      },
      ...{
        productId: string;
        variantId: string;
        qty: number;
        /**
         * Đơn giá VND tại thời điểm đặt
         */
        price: number;
        /**
         * Tên sản phẩm đã resolve (R2 FI-312: notification cần cho email xác nhận — contract cấm consumer call-back HTTP)
         */
        name?: string;
        [k: string]: unknown;
      }[]
    ];
    /**
     * Tổng hàng VND (chưa giảm)
     */
    subtotal: number;
    /**
     * Tổng giảm giá VND (coupon + điểm)
     */
    discount: number;
    /**
     * Phí ship VND
     */
    shippingFee: number;
    /**
     * Tổng thanh toán VND = subtotal - discount + shippingFee
     */
    total: number;
    currency: string;
    /**
     * Optional — code coupon đã áp (nếu có)
     */
    couponCode?: string;
    /**
     * Optional nullable — ref code affiliate được attribution; null khi không qua affiliate
     */
    affiliateCode?: string | null;
    confirmedAt: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
