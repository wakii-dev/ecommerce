// mfe-checkout — remote cart/checkout/confirmation (SF-6). Port 5175
// (.env.example REMOTE_CHECKOUT_URL). Proxy /api → gateway (GATEWAY_URL override
// cho walkthrough gateway riêng) — standalone dev cùng same-origin cookie
// cart_token (khi chạy dưới shell thì proxy của shell lo).
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

export default defineConfig({
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: 5175,
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true }
    }
  }
});
