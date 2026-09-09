import { formatVnd, type Locale } from './format';

/**
 * Coupon center (Task 14) — shape `PublicCoupon` của contracts/openapi/
 * ordering.yaml (endpoint GET /api/ordering/coupons/public, SF-9 mới có route
 * thật; storefront mock-gate empty state khi lỗi).
 */
export type CouponType = 'PERCENT' | 'FIXED';

export interface PublicCoupon {
  code: string;
  /** PERCENT → value là %; FIXED → value là số VND. */
  type: CouponType;
  value: number;
  /** Đơn tối thiểu (VND) — nếu có. */
  minOrderValue?: number;
  startsAt?: string;
  endsAt?: string;
  description: string;
}

/** Nhãn giá trị giảm: `Giảm 10%` / `Giảm 50.000 ₫` (en: `10% off` / `50.000 ₫ off`). */
export function couponValueLabel(type: CouponType, value: number, locale: Locale): string {
  if (type === 'PERCENT') return locale === 'en' ? `${value}% off` : `Giảm ${value}%`;
  return locale === 'en' ? `${formatVnd(value)} off` : `Giảm ${formatVnd(value)}`;
}

/** Pill "Hết hạn" chỉ khi endsAt parse được VÀ đã qua (direction §4 tint-new — không bịa khi thiếu/invalid). */
export function isExpired(endsAt: string): boolean {
  const date = new Date(endsAt);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}
