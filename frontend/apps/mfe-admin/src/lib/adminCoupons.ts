// lib/adminCoupons.ts — admin coupon API (FI-369 SF-2, amendment A3).
//
// Đang gọi thẳng qua authStore.fetch (CÙNG plumbing identityBaseUrl +
// single-flight refresh như contracts client) với types local đóng băng theo
// A3 proposal trên FI-369. KHI coordinator apply A3 + regen contracts: thay
// internals bằng orderingApi() (adminListCoupons/adminCreateCoupon/
// adminUpdateCoupon/adminDeleteCoupon/adminSetCouponActive) — signature +
// error surface (ApiErrorClient) giữ nguyên, CouponsPage không đổi.
//
// Lý do chưa thêm routes vào clients/ordering.ts: RouteMap đòi key
// `operations[...]` từ generated schema — A3 chưa apply → TS break toàn app.

import { authStore } from '@ecommerce/auth';
import { ApiErrorClient, type ApiErrorShape } from '@ecommerce/contracts';
import type { AdminCouponView, CouponWriteBody } from './couponForm';

const BASE = '/api/ordering/admin/coupons';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const config = authStore.getConfig();
  const res = await authStore.fetch(`${config.identityBaseUrl ?? ''}${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    // problem+json (RFC 7807) — parse lỗi như contracts client (client.ts:191)
    const shape = (await res.json().catch(() => ({}))) as ApiErrorShape;
    throw new ApiErrorClient(shape, res.status, res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function adminListCoupons(): Promise<AdminCouponView[]> {
  return call<AdminCouponView[]>('GET', '');
}

export function adminCreateCoupon(body: CouponWriteBody): Promise<AdminCouponView> {
  return call<AdminCouponView>('POST', '', body);
}

export function adminUpdateCoupon(code: string, body: CouponWriteBody): Promise<AdminCouponView> {
  return call<AdminCouponView>('PUT', `/${encodeURIComponent(code)}`, body);
}

export function adminDeleteCoupon(code: string): Promise<void> {
  return call<void>('DELETE', `/${encodeURIComponent(code)}`);
}

export function adminSetCouponActive(code: string, active: boolean): Promise<AdminCouponView> {
  return call<AdminCouponView>('PUT', `/${encodeURIComponent(code)}/active`, { active });
}
