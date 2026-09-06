import type { ComponentType } from 'react';
import { authStore } from '@ecommerce/auth';
import CartBadge from './CartBadge';
import { mergeGuestCart, readGuestToken } from './lib/cartApi';

export type SlotKey = 'left' | 'center' | 'right';

/** Cắt INTERFACE tối thiểu của shell — remote không import code host (MF 1 chiều).
 *  (Cùng shape với initAccountShell của mfe-account SF-3.) */
export interface ShellContext {
  HeaderSlots: {
    register(slot: SlotKey, id: string, component: ComponentType): void;
    unregister(slot: SlotKey, id: string): void;
  };
  navigate: (to: string) => void;
  onRegistryChange?: () => void;
}

let navigateRef: ((to: string) => void) | null = null;

/** Navigate qua router của shell (remote không mang router riêng vào host). */
export function appNavigate(to: string): void {
  navigateRef?.(to);
}

/** Merge-on-login — authStore (shared singleton) flip guest→user:
 *  còn guest token trong localStorage → POST /api/cart/merge (Bearer tự gắn qua
 *  authStore.fetch). 404 (giỏ guest hết hạn) → clear token im lặng. Login page
 *  KHÔNG cần biết cart tồn tại — zero touch mfe-account. */
function watchMergeOnLogin(): void {
  let wasAuthenticated = authStore.isAuthenticated();
  authStore.subscribe(() => {
    const isAuth = authStore.isAuthenticated();
    if (isAuth && !wasAuthenticated) {
      const token = readGuestToken();
      if (token) {
        void mergeGuestCart((input, init) => authStore.fetch(input, init), token);
      }
    }
    wasAuthenticated = isAuth;
  });
}

/** Shell gọi ĐÚNG 1 lần lúc boot (eager) — đăng ký CartBadge + merge watcher. */
export function initCheckoutShell(ctx: ShellContext): void {
  navigateRef = ctx.navigate;
  ctx.HeaderSlots.register('right', 'checkout-cart-badge', CartBadge);
  ctx.onRegistryChange?.();
  watchMergeOnLogin();
}
