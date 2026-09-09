/**
 * cart-badge contract (FI-398 T8, spec §3.6) — chrome SỞ HỮU literal window
 * event + kiểu badge-count tối thiểu. `apps/mfe-checkout/src/lib/cartApi.ts`
 * GIỮ NGUYÊN và giữ BẢN LITERAL RIÊNG (cùng giá trị 'ecommerce:cart-changed')
 * — mutation phía checkout tiếp tục dispatch literal đó; từ giờ NGUỒN CONTRACT
 * là chrome (listener đăng ký qua CART_CHANGED_EVENT của chrome), đổi giá trị
 * event sau này chỉ đụng chrome + cartApi (2 chỗ documented), không rải literal
 * qua các MFE khác.
 */

/** Window CustomEvent báo "giỏ vừa đổi" — mọi MFE (PDP/checkout) dispatch,
 *  CartBadge + listener khác refresh (cùng window qua gateway). */
export const CART_CHANGED_EVENT = 'ecommerce:cart-changed';

/** Shape badge cần từ GET /api/cart — structural-compatible với `Cart` của
 *  checkout cartApi (chrome KHÔNG copy data-access; fetchCart inject — spec
 *  §3.6: checkout giữ cartApi.ts NGUYÊN VỊ). */
export interface CartBadgeCart {
  items: { qty: number }[];
}

/** Số lượng badge = Σ qty (chuẩn Tiki — không phải số dòng); null (guest 404)
 *  → 0. Port logic `cartCount` của checkout lib/cartApi. */
export function cartBadgeCount(cart: CartBadgeCart | null): number {
  return cart ? cart.items.reduce((sum, item) => sum + item.qty, 0) : 0;
}
