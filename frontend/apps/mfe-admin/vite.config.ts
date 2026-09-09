// mfe-admin — remote quản trị (SF-7). Port 5177 (.env.example REMOTE_ADMIN_URL).
// Proxy /api → gateway: standalone dev cùng same-origin cookie (khi chạy dưới
// shell thì proxy của shell lo).
// SF-3 (FI-400) 1-origin dev entry: base `/remotes/admin/` mirror prod bake
// (Dockerfile.web) + DEV_PORT 1 nguồn cho port + hmr.clientPort.
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

const mfeConfig = defineMfeConfig({
  name: 'mfe_admin',
  exposes: {
    './bootstrap': './src/bootstrap.tsx',
    './AdminApp': './src/AdminApp.tsx'
  }
});

const devPort = Number(process.env.DEV_PORT ?? 5177);

export default defineConfig({
  base: '/remotes/admin/',
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: devPort,
    strictPort: true,
    hmr: { clientPort: devPort },
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true },
      // SF-13 A3: preview ảnh upload MinIO (/media/products/...) qua gateway
      '/media': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true }
    }
  }
});
