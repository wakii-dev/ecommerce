import React from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@ecommerce/i18n';
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import App from './App';
import { ShellNav } from './header/Header';
import { HeaderSlots } from './header/HeaderSlots';
import { navigate } from './router';

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

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
