import React from 'react';
import { createRoot } from 'react-dom/client';
import { configureAuth } from '@ecommerce/auth';
import { initI18n } from '@ecommerce/i18n';
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/fonts';
import LoginPage from './pages/LoginPage';
import './page.css';

// Standalone dev page (:5176) — remote chạy riêng để debug. Trong harness thật,
// các page được nạp QUA SHELL (window.__shellReact__ do shell gắn trước khi
// remoteEntry.js được fetch — xem apps/shell/src/main.tsx; auth config + đăng ký
// widget do bootstrap.tsx/initAccountShell lo lúc đó).
(window as any).__shellReact__ = React;
document.documentElement.dataset.theme = 'storefront';

// Standalone vẫn cần auth config — vite proxy /api → gateway giữ same-origin cookie.
configureAuth({
  refreshUrl: '/api/identity/auth/refresh',
  identityBaseUrl: '',
  loginPath: '/login'
});

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<LoginPage />);
});
