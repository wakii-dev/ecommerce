// Vitest config riêng (vite.config.ts của preset không mang type `test`) —
// merge base để giữ alias/plugin của app. Pattern: apps/mfe-checkout.
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vite.config';

export default mergeConfig(baseConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false
  }
}));
