// Skeleton remote = harness fixture (SF-2 Task 14) — expose Page + HeaderWidget
// cho shell host. Shared singletons do preset lo (react/ui-kit/i18n/auth...).
// SF-3 (FI-400) 1-origin dev entry: base `/remotes/skeleton/` mirror prod bake
// (Dockerfile.web) + DEV_PORT 1 nguồn cho port + hmr.clientPort.
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

const mfeConfig = defineMfeConfig({
  name: 'mfe_skeleton',
  exposes: {
    './Page': './src/Page.tsx',
    './HeaderWidget': './src/HeaderWidget.tsx'
  }
});

const devPort = Number(process.env.DEV_PORT ?? 5178);

export default defineConfig({
  base: '/remotes/skeleton/',
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: { port: devPort, strictPort: true, hmr: { clientPort: devPort } }
});
