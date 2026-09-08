// Shell = MF host (SF-2 Task 14). Preset lo federation plugin + shared
// singletons; app chỉ bổ sung plugin-react (JSX transform) + port 5173
// (5174-5177 đã dành storefront/checkout/account/admin — .env.example SF-1).
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

// SPA fallback: serve index.html tại mọi route (MF plugin override appType)
const spaFallback = {
  appType: 'spa' as const,
  plugins: [
    {
      name: 'spa-fallback',
      configureServer(server: import('vite').ViteDevServer) {
        server.middlewares.use((req, _res, next) => {
          if (req.method === 'GET' && !req.url?.includes('.') && !req.url?.startsWith('/@')) {
            req.url = '/';
          }
          next();
        });
      }
    }
  ]
};

const mfeConfig = defineMfeConfig({
  name: 'shell_host',
  remotes: {
    // Object form + type 'module' — remote của ta là Vite ESM entry; string
    // form `skeleton@url` mặc định type 'var' (chỉ cho remote global-format
    // webpack/Rspack — README @module-federation/vite). `name` PHẢI khớp
    // federation name của remote (`mfe_skeleton`, apps/_skeleton-remote);
    // key 'skeleton' bên trái là alias cho import specifier 'skeleton/Page'.
    skeleton: {
      type: 'module',
      name: 'mfe_skeleton',
      entry: `${process.env.REMOTE_SKELETON_URL ?? 'http://localhost:5178'}/remoteEntry.js`
    },
    // mfe-account (SF-3) — login/register/profile; import specifier 'account/*'
    // (remotes.d.ts). `name` khớp federation name của remote (apps/mfe-account).
    account: {
      type: 'module',
      name: 'mfe_account',
      entry: `${process.env.REMOTE_ACCOUNT_URL ?? 'http://localhost:5176'}/remoteEntry.js`
    },
    // mfe-checkout (SF-6) — cart/checkout/confirmation + CartBadge; import
    // specifier 'checkout/*' (remotes.d.ts). Remote bootstrap tự đăng ký badge
    // + merge watcher lúc shell eager import (main.tsx).
    checkout: {
      type: 'module',
      name: 'mfe_checkout',
      entry: `${process.env.REMOTE_CHECKOUT_URL ?? 'http://localhost:5175'}/remoteEntry.js`
    },
    // mfe-admin (SF-7) — products/categories/coupons/reviews/orders/dashboard;
    // import specifier 'admin/*' (remotes.d.ts). `name` khớp federation name
    // của remote (apps/mfe-admin).
    admin: {
      type: 'module',
      name: 'mfe_admin',
      entry: `${process.env.REMOTE_ADMIN_URL ?? 'http://localhost:5177'}/remoteEntry.js`
    }
  }
});

export default defineConfig({
  ...spaFallback,
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: 5173,
    // Same-origin cho /api → cookie refresh_token hoạt động (SameSite=Lax).
    // Cross-origin fetch thẳng :8080 sẽ KHÔNG mang cookie → bắt buộc đi proxy.
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true }
    }
  }
});
