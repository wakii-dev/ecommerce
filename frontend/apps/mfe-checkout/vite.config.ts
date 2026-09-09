// mfe-checkout — remote cart/checkout/confirmation (SF-6). Port 5175
// (.env.example REMOTE_CHECKOUT_URL). Proxy /api → gateway (GATEWAY_URL override
// cho walkthrough gateway riêng) — standalone dev cùng same-origin cookie
// cart_token (khi chạy dưới shell thì proxy của shell lo).
// SF-3 (FI-400) 1-origin dev entry: base `/remotes/checkout/` — mirror prod
// bake `vite build --base=/remotes/checkout/` (Dockerfile.web) để MỌI URL của
// remote (module, /@vite/client, deps) nằm dưới 1 prefix qua entry :3000.
// DEV_PORT = 1 nguồn cho server.port + hmr.clientPort (ws nối TRỰC TIẾP bypass
// entry — page qua :3000 nhưng HMR client nối thẳng port thật).
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

const mfeConfig = defineMfeConfig({
  name: 'mfe_checkout',
  exposes: {
    './bootstrap': './src/bootstrap.tsx',
    './CartBadge': './src/CartBadge.tsx',
    './CartPage': './src/pages/CartPage.tsx',
    './CheckoutPage': './src/pages/CheckoutPage.tsx',
    './ConfirmationPage': './src/pages/ConfirmationPage.tsx'
  }
});

const devPort = Number(process.env.DEV_PORT) > 0 ? Number(process.env.DEV_PORT) : 5175;

export default defineConfig({
  base: '/remotes/checkout/',
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: devPort,
    // Port bận → fail LOUD thay vì auto-increment lệch rewrite dest (SF-3).
    strictPort: true,
    hmr: { clientPort: devPort },
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true }
    }
  }
});
