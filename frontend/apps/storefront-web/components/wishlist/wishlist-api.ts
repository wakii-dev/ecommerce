'use client';

import { authedFetch, ensureSession } from '../../lib/account-session';

/**
 * Wishlist client API (SF-8, spec Q15 — file RIÊNG slice wishlist, không phụ
 * thuộc lib của reviews slice — plan-critic P1). ids cache module-level: 1
 * fetch `/wishlist/ids` per page cho MỌI heart (PDP + cả grid PLP).
 */

let idsPromise: Promise<Set<string>> | null = null;

/** Set productId đã heart — guest → Set rỗng (không call API). */
export function fetchWishlistIds(): Promise<Set<string>> {
  idsPromise ??= ensureSession().then((ok) =>
    ok
      ? authedFetch('/api/catalog/me/wishlist/ids')
          .then((res) => (res.ok ? res.json() : { productIds: [] as string[] }))
          .then((data: { productIds?: string[] }) => new Set(data.productIds ?? []))
          .catch(() => new Set<string>())
      : Promise.resolve(new Set<string>()),
  );
  return idsPromise;
}

/** Toggle xong gọi — lần heart tiếp theo (hoặc page mới) fetch lại ids. */
export function bustWishlistIdsCache(): void {
  idsPromise = null;
}

/** PUT add / DELETE remove — trả true khi 204 (idempotent cả 2 chiều). */
export async function toggleWishlist(productId: string, add: boolean): Promise<boolean> {
  const res = await authedFetch(`/api/catalog/me/wishlist/${encodeURIComponent(productId)}`, {
    method: add ? 'PUT' : 'DELETE',
  });
  return res.status === 204;
}

/** Pure reducer cho test — áp toggle vào danh sách ids. */
export function applyToggle(ids: string[], productId: string, add: boolean): string[] {
  const has = ids.includes(productId);
  if (add && !has) return [...ids, productId];
  if (!add && has) return ids.filter((id) => id !== productId);
  return ids;
}
