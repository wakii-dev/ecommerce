// Shell = MF host (SF-2 Task 14). Preset lo federation plugin + shared
// singletons; app chỉ bổ sung plugin-react (JSX transform) + port 5173
// (5174-5177 đã dành storefront/checkout/account/admin — .env.example SF-1).
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

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
    }
  }
});

export default defineConfig({
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: { port: 5173 }
});
