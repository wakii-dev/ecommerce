// lib/adminCoupons.ts — admin coupon API (FI-369 SF-2, amendment A3 a205cbf).
//
// Đã swap sang orderingApi() GENERATED (T7 — contracts A3 landed + regen).
// Signature giữ nguyên từ thời adapter tay → CouponsPage không đổi.
//
// Cast notes (2 điểm có chủ đích, không phải lười type):
// - Response: contract `AdminCoupon` thiếu minOrderValue/description nhưng BE
//   baseline (89adcd9) trả đầy đủ (DTO 10 trường) — FE view dùng superset
//   AdminCouponView. A3.1 candidate: coordinator mở rộng schema response.
// - Request: FE gửi thêm minOrderValue/description ngoài `AdminCouponUpsert`
//   (BE validateAdmin nhận) — cùng A3.1 candidate.

import type { OrderingClient } from '@ecommerce/contracts';
import { orderingApi } from './api';
import type { AdminCouponView, CouponWriteBody } from './couponForm';

type UpsertArgs = Parameters<OrderingClient['createAdminCoupon']>[0];

export function adminListCoupons(): Promise<AdminCouponView[]> {
  return orderingApi().listAdminCoupons({}) as unknown as Promise<AdminCouponView[]>;
}

export function adminCreateCoupon(body: CouponWriteBody): Promise<AdminCouponView> {
  return orderingApi().createAdminCoupon(body as UpsertArgs) as Promise<AdminCouponView>;
}

export function adminUpdateCoupon(code: string, body: CouponWriteBody): Promise<AdminCouponView> {
  return orderingApi().updateAdminCoupon({
    ...body,
    code // path param thắng — BE dùng code đường dẫn, body code bỏ qua
  } as UpsertArgs) as Promise<AdminCouponView>;
}

export function adminDeleteCoupon(code: string): Promise<void> {
  return orderingApi().deleteAdminCoupon({ code }) as unknown as Promise<void>;
}

/** POST /{code}/toggle — flip active (contract A3: không body). */
export function adminToggleCoupon(code: string): Promise<AdminCouponView> {
  return orderingApi().toggleAdminCoupon({ code }) as Promise<AdminCouponView>;
}
