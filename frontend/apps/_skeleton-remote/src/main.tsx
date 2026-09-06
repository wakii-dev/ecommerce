import React from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from '@ecommerce/i18n';
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
import Page from './Page';

// Standalone dev page — remote chạy riêng để debug. Trong harness thật, Page
// được nạp QUA SHELL (khi đó window.__shellReact__ do shell gắn trước khi
// remoteEntry.js được fetch — xem apps/shell/src/main.tsx).
(window as any).__shellReact__ = React;
document.documentElement.dataset.theme = 'storefront';

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<Page />);
});
