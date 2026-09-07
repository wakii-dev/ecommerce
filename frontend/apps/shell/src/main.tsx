import React from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@ecommerce/i18n';
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import App from './App';
import { ShellNav } from './header/Header';
import { HeaderSlots } from './header/HeaderSlots';
import { navigate } from './router';
import { initGa } from './ga';

// Chip kiểm chứng React singleton (Task 14): shell gắn bản React CỦA MÌNH lên
// window TRƯỚC khi module nào của remote được nạp (import động chạy sau
// bootstrap này) — Page của remote so sánh `window.__shellReact__ === React`
// để chứng minh chỉ có 1 instance xuyên MF boundary.
(window as any).__shellReact__ = React;

// Theme mặc định cho ui-kit tokens (route /ui-kit cho phép switch 2 theme)
document.documentElement.dataset.theme = 'storefront';

// Nav mặc định của shell — registry pattern: chính shell cũng đăng ký qua
// HeaderSlots như mọi consumer khác, Header.tsx không hardcode item nào.
HeaderSlots.register('left', 'shell-nav', ShellNav);

// mfe-account (SF-3) — eager bootstrap: remote tự đăng ký auth widget vào slot
// 'right' + khôi phục phiên (refresh-on-boot). KHÔNG chặn render nếu remote
// down (catch chỉ warn — auth widget tạm vắng). Khi registry đổi, remote gọi
// onRegistryChange → dispatch event → App.tsx bump re-render Header.
const onHeaderSlotsChanged = (): void => {
  window.dispatchEvent(new CustomEvent('ecommerce:header-slots-changed'));
};
import('account/bootstrap')
  .then((m) => m.initAccountShell({ HeaderSlots, navigate, onRegistryChange: onHeaderSlotsChanged }))
  .catch((error) => console.warn('[shell] mfe-account chưa chạy — auth widget tạm vắng:', error.message));

// mfe-checkout (SF-6) — eager bootstrap: đăng ký CartBadge slot 'right' +
// merge-on-login watcher (authStore subscribe). KHÔNG chặn render nếu remote
// down — badge tạm vắng, cart/checkout vẫn mở được qua route khác.
import('checkout/bootstrap')
  .then((m) => m.initCheckoutShell({ HeaderSlots, navigate, onRegistryChange: onHeaderSlotsChanged }))
  .catch((error) => console.warn('[shell] mfe-checkout chưa chạy — cart badge tạm vắng:', error.message));

// mfe-admin (SF-7) — eager init: chỉ lưu navigate + configureAuth (không đăng
// ký widget header — admin có topbar riêng). Guard của AdminApp tự lo refresh
// + redirect; remote down không chặn shell (catch chỉ warn).
import('admin/bootstrap')
  .then((m) => m.initAdminShell({ HeaderSlots, navigate }))
  .catch((error) => console.warn('[shell] mfe-admin chưa chạy — khu /admin tạm 404:', error.message));

// SF-13 A7a: GA4 — VITE_GA_ID có mới nạp script (env-gated)
initGa();

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
