import type { ComponentType } from 'react';
import { authStore, configureAuth } from '@ecommerce/auth';
import AuthWidget from './AuthWidget';
import OrdersNavLink from './pages/orders/OrdersNavLink';
import AffiliateNavLink from './pages/affiliate/AffiliateNavLink';

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

/** Shell gọi ĐÚNG 1 lần lúc boot (eager) — đăng ký auth widget + khôi phục phiên. */
export function initAccountShell(ctx: ShellContext): void {
  navigateRef = ctx.navigate;
  configureAuth({
    refreshUrl: '/api/identity/auth/refresh',
    identityBaseUrl: '',
    loginPath: '/login'
  });
  ctx.HeaderSlots.register('right', 'account-auth', AuthWidget);
  // SF-9 (FI-319): link "Đơn hàng" — slot registry additive (widget từ pages/orders slice)
  ctx.HeaderSlots.register('right', 'orders-nav', OrdersNavLink);
  // SF-12 (FI-322): link "Affiliate" — slot registry additive (pages/affiliate slice)
  ctx.HeaderSlots.register('right', 'affiliate-nav', AffiliateNavLink);
  ctx.onRegistryChange?.();
  void authStore.refresh().then((ok) => readyResolve?.(ok));
}
