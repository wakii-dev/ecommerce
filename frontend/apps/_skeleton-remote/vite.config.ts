// Skeleton remote = harness fixture (SF-2 Task 14) — expose Page + HeaderWidget
// cho shell host. Shared singletons do preset lo (react/ui-kit/i18n/auth...).
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

const mfeConfig = defineMfeConfig({
  name: 'mfe_skeleton',
  exposes: {
    './Page': './src/Page.tsx',
    './HeaderWidget': './src/HeaderWidget.tsx'
  }
});

export default defineConfig({
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: { port: 5178 }
});
