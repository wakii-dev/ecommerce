import React from 'react';
import { createRoot } from 'react-dom/client';
import { configureAuth } from '@ecommerce/auth';
import { initI18n } from '@ecommerce/i18n';
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/fonts';
import './page.css';

// Standalone dev page (:5175) — remote chạy riêng để debug các module khi shell
// không chạy. Trong harness thật, cart/checkout nạp QUA SHELL
// (window.__shellReact__ do shell gắn trước khi remoteEntry fetch được;
// CartBadge + merge watcher do bootstrap.tsx/initCheckoutShell lo lúc đó).
(window as any).__shellReact__ = React;
document.documentElement.dataset.theme = 'storefront';

configureAuth({
  refreshUrl: '/api/identity/auth/refresh',
  identityBaseUrl: '',
  loginPath: '/login'
});

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <div style={{ padding: 24 }}>
      mfe-checkout standalone — mở qua shell (<code>/cart</code>,{' '}
      <code>/checkout</code>) hoặc chạy từng page trong shell router.
    </div>
  );
});
