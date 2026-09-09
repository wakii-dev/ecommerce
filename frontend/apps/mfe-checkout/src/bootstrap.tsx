import { useState } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { CartBadge as ChromeCartBadge } from '@ecommerce/chrome';
import { fetchCart, mergeGuestCart, readGuestToken } from './lib/cartApi';
import MiniCartDrawer from './MiniCartDrawer';
// FI-368 T11: page.css chỉ import ở main.tsx (standalone) — dưới shell remote
// không chạy main.tsx => page-specific css mất. Vite dedupe standalone.
import './page.css';
// SF-1 FI-391: ui-kit css cả 2 biên MF (FI-368 T11 — remote standalone qua
// bootstrap không chạy main.tsx; dưới shell dedupe vô hại với import của host).
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/fonts';

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

/**
 * Đăng ký TRỰC TIẾP component chrome (SF-4 FI-401 — exit criteria P1):
 * wrapper file ./CartBadge.tsx ĐÃ XÓA. Binding checkout-owned inline tại
 * bootstrap (SF-1 design: checkout giữ data-access fetchCart + UI phụ
 * MiniCartDrawer — chrome không copy GET/drawer). Registration id/slot GIỮ.
 */
function CheckoutCartBadge(): ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <ChromeCartBadge fetchCart={fetchCart} onOpen={() => setDrawerOpen(true)} />
      {drawerOpen ? <MiniCartDrawer open onClose={() => setDrawerOpen(false)} /> : null}
    </>
  );
}

/** Shell gọi ĐÚNG 1 lần lúc boot (eager) — đăng ký CartBadge + merge watcher. */
export function initCheckoutShell(ctx: ShellContext): void {
  navigateRef = ctx.navigate;
  ctx.HeaderSlots.register('right', 'checkout-cart-badge', CheckoutCartBadge);
  ctx.onRegistryChange?.();
  watchMergeOnLogin();
}
