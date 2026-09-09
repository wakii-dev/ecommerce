import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { initI18n } from '@ecommerce/i18n';
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/fonts';
import '@ecommerce/chrome/styles.css';
import './base.css';
import './header.css'; // vẫn style shell-owned: .shell-logo/.shell-search/.shell-mininav* (chrome.css KHÔNG dup)
import App from './App';
import { ShellNav } from './header/Header';
import ShellSearch from './header/ShellSearch';
import { HEADER_SLOTS_CHANGED_EVENT, HeaderSlots, ThemeToggle } from '@ecommerce/chrome';
import { navigate } from './router';
import { initGa } from './ga';
import { injectLiveChat } from './livechat';

// Chip kiểm chứng React singleton (Task 14): shell gắn bản React CỦA MÌNH lên
// window TRƯỚC khi module nào của remote được nạp (import động chạy sau
// bootstrap này) — Page của remote so sánh `window.__shellReact__ === React`
// để chứng minh chỉ có 1 instance xuyên MF boundary.
(window as any).__shellReact__ = React;

// Theme: boot script trong index.html set data-theme TRƯỚC paint (anti-FOUC,
// SF-15 dark mode) — main.tsx KHÔNG hard-set nữa (trước đây 'storefront' ghi
// đè lựa chọn dark của user mỗi boot).

// Nav mặc định của shell — registry pattern: chính shell cũng đăng ký qua
// HeaderSlots như mọi consumer khác, Header.tsx không hardcode item nào.
HeaderSlots.register('left', 'shell-nav', ShellNav);
// Search form (FI-393 T2) — slot 'center': GET native sang storefront
// /search?q= (cross-origin full navigation, không SPA navigate).
HeaderSlots.register('center', 'shell-search', ShellSearch);
// Toggle dark mode (SF-15) — slot 'right' cạnh auth widget/cart badge.
HeaderSlots.register('right', 'theme-toggle', ThemeToggle);

// Live chat widget (SF-15) — env VITE_LIVECHAT_LICENSE_ID; thiếu → không load.
injectLiveChat();

// mfe-account (SF-3) — eager bootstrap: remote tự đăng ký auth widget vào slot
// 'right' + khôi phục phiên (refresh-on-boot). KHÔNG chặn render nếu remote
// down (catch chỉ warn — auth widget tạm vắng). Khi registry đổi, remote gọi
// onRegistryChange → dispatch event → App.tsx bump re-render Header.
const onHeaderSlotsChanged = (): void => {
  window.dispatchEvent(new CustomEvent(HEADER_SLOTS_CHANGED_EVENT));
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

// BUG-04 (register SF-1 relay → SF-2 T7): workspace resolve NHIỀU instance
// i18next (pnpm store) — useT/react-i18next của shell đọc instance MẶC ĐỊNH
// của nó, không phải instance initI18n() đã nạp resources => header/Home
// render raw key "nav.home". Bind CHẮC qua I18nextProvider (cùng pattern
// AdminApp.tsx đã dùng).
void initI18n().then((i18n) => {
  createRoot(document.getElementById('root')!).render(
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  );
});
