// mfe-account — remote đăng nhập/đăng ký/profile (SF-3). Port 5176 (.env.example
// REMOTE_ACCOUNT_URL). Proxy /api → gateway: standalone dev cùng same-origin
// cookie (khi chạy dưới shell thì proxy của shell lo).
// SF-3 (FI-400) 1-origin dev entry: base `/remotes/account/` mirror prod bake
// (Dockerfile.web) + DEV_PORT 1 nguồn cho port + hmr.clientPort.
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

const mfeConfig = defineMfeConfig({
  name: 'mfe_account',
  exposes: {
    './bootstrap': './src/bootstrap.tsx',
    './AuthWidget': './src/AuthWidget.tsx',
    './LoginPage': './src/pages/LoginPage.tsx',
    './ForgotPasswordPage': './src/pages/ForgotPasswordPage.tsx',
    './ResetPasswordPage': './src/pages/ResetPasswordPage.tsx',
    './RegisterPage': './src/pages/RegisterPage.tsx',
    './AccountPage': './src/pages/AccountPage.tsx',
    // SF-15 (FI-325) — oauth callback + 2FA slice
    './OAuthCallbackPage': './src/pages/OAuthCallbackPage.tsx',
    './TwoFactorPage': './src/pages/TwoFactorPage.tsx',
    // SF-9 (FI-319) — my-orders slice (pages/orders/*)
    './OrdersPage': './src/pages/orders/OrdersPage.tsx',
    './OrderDetailPage': './src/pages/orders/OrderDetailPage.tsx',
    './OrdersNavLink': './src/pages/orders/OrdersNavLink.tsx',
    // SF-8 append — wishlist + my-reviews slice
    './WishlistPage': './src/pages/wishlist/WishlistPage.tsx',
    './MyReviewsPage': './src/pages/my-reviews/MyReviewsPage.tsx',
    // SF-12 (FI-322) — affiliate dashboard slice (pages/affiliate/*)
    './AffiliatePage': './src/pages/affiliate/AffiliatePage.tsx',
    './AffiliateNavLink': './src/pages/affiliate/AffiliateNavLink.tsx'
  }
});

const devPort = Number(process.env.DEV_PORT) > 0 ? Number(process.env.DEV_PORT) : 5176;

export default defineConfig({
  base: '/remotes/account/',
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: devPort,
    strictPort: true,
    hmr: { clientPort: devPort },
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true }
    }
  }
});
