import React from 'react';
import { createRoot } from 'react-dom/client';
import { configureAuth } from '@ecommerce/auth';
import { initI18n } from '@ecommerce/i18n';
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import AdminApp from './AdminApp';
import './page.css';

// Standalone dev page (:5177) — remote chạy riêng để debug. Trong harness thật,
// AdminApp được nạp QUA SHELL (window.__shellReact__ do shell gắn trước khi
// remoteEntry.js được fetch; auth config + navigate do bootstrap.tsx lo).
(window as any).__shellReact__ = React;
document.documentElement.dataset.theme = 'admin';

// Standalone vẫn cần auth config — vite proxy /api → gateway giữ same-origin cookie.
configureAuth({
  refreshUrl: '/api/identity/auth/refresh',
  identityBaseUrl: '',
  loginPath: '/login'
});

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<AdminApp />);
});
