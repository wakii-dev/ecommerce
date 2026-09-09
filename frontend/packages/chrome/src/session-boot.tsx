'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { authStore, configureAuth } from '@ecommerce/auth';

/**
 * Session boot dùng chung (FI-398 T10, spec §3.8 — pattern storefront
 * `lib/account-session.ts`, bản đó giữ nguyên đến SF-2/SF-4 dedupe):
 * access token CHỈ sống in-memory → host gọi ensureSession() sớm (trước khi
 * mount) để khôi phục phiên qua refresh cookie httpOnly.
 *
 * First-call-wins như initI18n: host gọi sớm với config CỦA MÌNH lần đầu
 * (vd storefront truyền loginPath '/account'); các lần gọi sau KHÔNG
 * reconfigure, KHÔNG refresh lại — trả cùng promise (single-flight per page).
 * KHÔNG đụng sync/broadcast giữa các app (SF-2 sở hữu).
 */

export interface SessionBootOptions {
  loginPath?: string;
}

let configured = false;
let sessionPromise: Promise<boolean> | null = null;

export function ensureSession(options?: SessionBootOptions): Promise<boolean> {
  if (!configured) {
    configureAuth({
      refreshUrl: '/api/identity/auth/refresh',
      identityBaseUrl: '',
      loginPath: options?.loginPath ?? '/login'
    });
    configured = true;
  }
  sessionPromise ??= authStore.refresh();
  return sessionPromise;
}

/**
 * 'use client' island — mount → boot phiên ngầm 1 lần; render children NGAY
 * (không gate render — cùng pattern boot hiện có, remote down/auth chậm
 * không chặn UI).
 */
export function SessionBootProvider({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    void ensureSession();
  }, []);
  return children;
}
