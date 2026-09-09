import type { ComponentType, ReactElement } from 'react';
import { authStore, configureAuth } from '@ecommerce/auth';
import { AuthMenu } from '@ecommerce/chrome';
import OrdersNavLink from './pages/orders/OrdersNavLink';
import AffiliateNavLink from './pages/affiliate/AffiliateNavLink';
// FI-368 T11: page.css chỉ import ở main.tsx (standalone) — dưới shell remote
// không chạy main.tsx => page-specific css mất. Vite dedupe standalone.
import './page.css';
// SF-1 FI-391: ui-kit css cả 2 biên MF (FI-368 T11 — remote standalone qua
// bootstrap không chạy main.tsx; dưới shell dedupe vô hại với import của host).
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/fonts';

export type SlotKey = 'left' | 'center' | 'right';

/** Cắt INTERFACE tối thiểu của shell — remote không import code host (MF 1 chiều). */
export interface ShellContext {
  HeaderSlots: {
    register(slot: SlotKey, id: string, component: ComponentType): void;
    unregister(slot: SlotKey, id: string): void;
  };
  navigate: (to: string) => void;
  onRegistryChange?: () => void;
}

let navigateRef: ((to: string) => void) | null = null;
let readyResolve: ((authenticated: boolean) => void) | undefined;

/** Promise settle khi boot-refresh xong — AccountPage guard CHỜ promise này. */
export const authReady: Promise<boolean> = new Promise<boolean>((resolve) => {
  readyResolve = resolve;
});

/** Navigate qua router của shell (remote không mang router riêng vào host). */
export function appNavigate(to: string): void {
  navigateRef?.(to);
}

/**
 * Đăng ký TRỰC TIẾP chrome AuthMenu (SF-4 FI-401 — exit criteria P1): wrapper
 * file ./AuthWidget.tsx ĐÃ XÓA (.um-* css về chrome.css sở hữu — page.css dọn
 * dup). onNavigate=appNavigate GIỮ SPA-nav shell (logout → /login qua router).
 */
function AccountAuthWidget(): ReactElement {
  return <AuthMenu onNavigate={appNavigate} />;
}

/** Shell gọi ĐÚNG 1 lần lúc boot (eager) — đăng ký auth widget + khôi phục phiên. */
export function initAccountShell(ctx: ShellContext): void {
  navigateRef = ctx.navigate;
  configureAuth({
    refreshUrl: '/api/identity/auth/refresh',
    identityBaseUrl: '',
    loginPath: '/login'
  });
  ctx.HeaderSlots.register('right', 'account-auth', AccountAuthWidget);
  // SF-9 (FI-319): link "Đơn hàng" — slot registry additive (widget từ pages/orders slice)
  ctx.HeaderSlots.register('right', 'orders-nav', OrdersNavLink);
  // SF-12 (FI-322): link "Affiliate" — slot registry additive (pages/affiliate slice)
  ctx.HeaderSlots.register('right', 'affiliate-nav', AffiliateNavLink);
  ctx.onRegistryChange?.();
  void authStore.refresh().then((ok) => readyResolve?.(ok));
}
