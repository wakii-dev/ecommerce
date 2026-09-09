// Shell = MF host (SF-2 Task 14). Preset lo federation plugin + shared
// singletons; app chỉ bổ sung plugin-react (JSX transform) + port 5173
// (5174-5177 đã dành storefront/checkout/account/admin — .env.example SF-1).
// SF-3 (FI-400) 1-origin dev entry :3000 — entry default RELATIVE
// /remotes/<name>/remoteEntry.js (browser resolve same-origin theo entry,
// mirror prod bake Dockerfile.web); server.proxy /remotes/<name> giữ prefix
// cho debug trực tiếp :5173; spa-fallback exempt /remotes (middleware này chạy
// TRƯỚC proxy — không exempt sẽ nuốt /remotes/checkout/@vite/client về '/');
// DEV_PORT 1 nguồn cho port + hmr.clientPort (ws nối trực tiếp bypass entry).
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

// SPA fallback: serve index.html tại mọi route (MF plugin override appType).
// SF-3: exempt /remotes/** — prefix đó thuộc proxy remote, không phải route shell.
const spaFallback = {
  appType: 'spa' as const,
  plugins: [
    {
      name: 'spa-fallback',
      configureServer(server: import('vite').ViteDevServer) {
        server.middlewares.use((req, _res, next) => {
          if (
            req.method === 'GET' &&
            !req.url?.includes('.') &&
            !req.url?.startsWith('/@') &&
            !req.url?.startsWith('/remotes/')
          ) {
            req.url = '/';
          }
          next();
        });
      }
    }
  ]
};

// D3 two-slot (SF-3): ENTRY (remote entry bake) nhận nguyên env (relative
// `/remotes/<name>` mặc định hoặc absolute legacy 2-origin); DESTINATION
// (proxy target) LUÔN absolute — env chỉ dùng khi khớp http(s), relative/unset
// → default absolute port. `REMOTE_<NAME>_PORT` override port target cho
// rig/debug khi remote chạy port lệch chuẩn mà muốn giữ entry relative.
const remoteEntry = (raw: string | undefined, name: string): string =>
  `${raw && raw.trim() ? raw.replace(/\/$/, '') : `/remotes/${name}`}/remoteEntry.js`;
const absTarget = (raw: string | undefined, name: string, port: number): string => {
  if (raw && /^https?:\/\//.test(raw)) return raw.replace(/\/$/, '');
  const override = process.env[`REMOTE_${name.toUpperCase()}_PORT`];
  return `http://localhost:${override || port}`;
};

const CHECKOUT = process.env.REMOTE_CHECKOUT_URL;
const ACCOUNT = process.env.REMOTE_ACCOUNT_URL;
const ADMIN = process.env.REMOTE_ADMIN_URL;
const SKELETON = process.env.REMOTE_SKELETON_URL;

const mfeConfig = defineMfeConfig({
  name: 'shell_host',
  // FI-402 fix-task (b): remoteEntry của HOST phải nằm dưới /assets/ —
  // @module-federation/vite emit `remoteEntry.js` ở output root mặc định,
  // chunk lazy (assets/*.js) import tĩnh `../remoteEntry.js` → resolve
  // `/remoteEntry.js` origin-root mà gateway route shell-web KHÔNG có
  // (predicate chỉ có /assets/**) → shell prod trắng trang. Path trong
  // `filename` = host-only; remotes GIỮ default 'remoteEntry.js' (topology
  // prod /remotes/<name>/remoteEntry.js của SF-3 không đổi). Zero-backend.
  filename: 'assets/remoteEntry.js',
  remotes: {
    // Object form + type 'module' — remote của ta là Vite ESM entry; string
    // form `skeleton@url` mặc định type 'var' (chỉ cho remote global-format
    // webpack/Rspack — README @module-federation/vite). `name` PHẢI khớp
    // federation name của remote (`mfe_skeleton`, apps/_skeleton-remote);
    // key 'skeleton' bên trái là alias cho import specifier 'skeleton/Page'.
    // SF-3: entry relative mặc định — same-origin qua entry :3000.
    skeleton: {
      type: 'module',
      name: 'mfe_skeleton',
      entry: remoteEntry(SKELETON, 'skeleton')
    },
    // mfe-account (SF-3) — login/register/profile; import specifier 'account/*'
    // (remotes.d.ts). `name` khớp federation name của remote (apps/mfe-account).
    account: {
      type: 'module',
      name: 'mfe_account',
      entry: remoteEntry(ACCOUNT, 'account')
    },
    // mfe-checkout (SF-6) — cart/checkout/confirmation + CartBadge; import
    // specifier 'checkout/*' (remotes.d.ts). Remote bootstrap tự đăng ký badge
    // + merge watcher lúc shell eager import (main.tsx).
    checkout: {
      type: 'module',
      name: 'mfe_checkout',
      entry: remoteEntry(CHECKOUT, 'checkout')
    },
    // mfe-admin (SF-7) — products/categories/coupons/reviews/orders/dashboard;
    // import specifier 'admin/*' (remotes.d.ts). `name` khớp federation name
    // của remote (apps/mfe-admin).
    admin: {
      type: 'module',
      name: 'mfe_admin',
      entry: remoteEntry(ADMIN, 'admin')
    }
  }
});

const devPort = Number(process.env.DEV_PORT) > 0 ? Number(process.env.DEV_PORT) : 5173;

export default defineConfig({
  ...spaFallback,
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: devPort,
    // Port bận → fail LOUD thay vì auto-increment lệch rewrite dest (SF-3).
    strictPort: true,
    hmr: { clientPort: devPort },
    // Same-origin cho /api → cookie refresh_token hoạt động (SameSite=Lax).
    // Cross-origin fetch thẳng :8080 sẽ KHÔNG mang cookie → bắt buộc đi proxy.
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true },
      // SF-3: debug trực tiếp :5173 vẫn load được remotes — proxy GIỮ prefix
      // (remote dev server chạy base /remotes/<name>/, xem apps/mfe-*). Còn
      // phục vụ host-relay HMR: metadata endpoint /remotes/<name>/__mf_hmr.
      '/remotes/checkout': { target: absTarget(CHECKOUT, 'checkout', 5175), changeOrigin: true },
      '/remotes/account': { target: absTarget(ACCOUNT, 'account', 5176), changeOrigin: true },
      '/remotes/admin': { target: absTarget(ADMIN, 'admin', 5177), changeOrigin: true },
      '/remotes/skeleton': { target: absTarget(SKELETON, 'skeleton', 5178), changeOrigin: true }
    }
  }
});
