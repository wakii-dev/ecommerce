'use client';

import { authStore, configureAuth } from '@ecommerce/auth';

/**
 * Session boot cho client components của storefront-web (SF-8, spec Q12):
 * access token CHỈ sống in-memory → mỗi lần tải trang (F5/đi từ shell sang
 * PDP) phải boot lại qua refresh cookie httpOnly (path `/api/identity`,
 * host-scoped — đi qua Next rewrites `/api` → gateway cùng origin).
 *
 * Single-flight per page: mọi heart/modal gọi ensureSession() nhưng CHỈ 1
 * request refresh thật sự bay. Guest (chưa login / cookie hết hạn) → false.
 */

let configured = false;
let sessionPromise: Promise<boolean> | null = null;

export function ensureSession(): Promise<boolean> {
  if (!configured) {
    configureAuth({
      refreshUrl: '/api/identity/auth/refresh',
      identityBaseUrl: '',
      loginPath: '/account',
    });
    configured = true;
  }
  sessionPromise ??= authStore.refresh();
  return sessionPromise;
}

/** Fetch có auth (Bearer + 401 → single-flight refresh → retry 1 lần). */
export function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return authStore.fetch(input, init);
}

export function getAuthUser(): { id: string; fullName?: string; email?: string } | null {
  return authStore.getUser();
}
