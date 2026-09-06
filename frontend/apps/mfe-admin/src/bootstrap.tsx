import type { ComponentType } from 'react';
import { configureAuth } from '@ecommerce/auth';

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

/** Navigate qua router của shell (remote không mang router riêng vào host). */
export function appNavigate(to: string): void {
  if (navigateRef) navigateRef(to);
  else {
    // Standalone dev (:5177) — không có router shell, dùng History API trực tiếp.
    window.history.pushState(null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

/**
 * Shell gọi ĐÚNG 1 lần lúc boot (eager, cùng lúc initAccountShell) — lưu
 * navigate + configureAuth (idempotent: cùng giá trị mfe-account đã set).
 * KHÔNG đăng ký widget header — admin tự có topbar trong AdminApp.
 */
export function initAdminShell(ctx: ShellContext): void {
  navigateRef = ctx.navigate;
  configureAuth({
    refreshUrl: '/api/identity/auth/refresh',
    identityBaseUrl: '',
    loginPath: '/login'
  });
}
