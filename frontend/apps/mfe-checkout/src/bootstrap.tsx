import type { ComponentType } from 'react';
import { authStore } from '@ecommerce/auth';
import CartBadge from './CartBadge';
import { mergeGuestCart, readGuestToken } from './lib/cartApi';
// FI-368 T11: page.css chỉ import ở main.tsx (standalone) — dưới shell remote
// không chạy main.tsx => page-specific css mất. Vite dedupe standalone.
import './page.css';

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
 *  POST /api/cart/merge luôn được gọi khi có chuyển đổi — guest token từ
 *  localStorage (nếu cùng origin) hoặc Cookie httpOnly fallback phía server
 *  (localStorage bị PORT-SCOPED — PDP :3000 ghi, shell :5179 không đọc được;
 *  cookie thì port-agnostic nên merge vẫn đúng giỏ). 400/404 = không có gì
 *  để merge → im lặng. Login page KHÔNG cần biết cart tồn tại — zero touch
 *  mfe-account. */
function watchMergeOnLogin(): void {
  let wasAuthenticated = authStore.isAuthenticated();
  authStore.subscribe(() => {
    const isAuth = authStore.isAuthenticated();
    if (isAuth && !wasAuthenticated) {
      void mergeGuestCart(readGuestToken()).catch(() => {
        // merge fail (mạng/cart chết) — user vẫn đăng nhập bình thường
      });
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
