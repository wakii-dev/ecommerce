// Vite preset dùng chung cho mọi app MFE — @module-federation/enhanced import
// SẴN ở đây (R3): SF-2 federation harness + các remote chỉ gọi hàm, không tự
// wire MF. Pattern shared singletons là BẮT BUỘC (spec R7 — 1 bản react/
// react-dom/auth/ui-kit/i18n toàn app; react-router KHÔNG shared — routing
// là của shell).
//
// Dùng trong app:
//   import { defineMfeConfig } from '@ecommerce/config/vite';
//   export default defineMfeConfig({ name: 'mfe_storefront', exposes: {...} });
import { defineConfig } from 'vite';
import federation from '@module-federation/enhanced';

const SHARED_SINGLETONS = {
  react: { singleton: true, requiredVersion: false },
  'react-dom': { singleton: true, requiredVersion: false },
  'react-router-dom': { singleton: false, requiredVersion: false },
  '@tanstack/react-query': { singleton: true, requiredVersion: false },
  i18next: { singleton: true, requiredVersion: false },
  'react-i18next': { singleton: true, requiredVersion: false }
};

/**
 * @param {object} opts
 * @param {string} opts.name        Tên remote duy nhất (vd 'mfe_storefront')
 * @param {string} [opts.filename]  Remote entry (default remoteEntry.js)
 * @param {object} [opts.exposes]   Module expose (remote)
 * @param {object} [opts.remotes]   Remote map (host)
 * @param {object} [opts.shared]    Ghi đè shared defaults nếu cần
 */
export function defineMfeConfig({ name, filename = 'remoteEntry.js', exposes, remotes, shared = {} }) {
  return defineConfig({
    build: {
      target: 'es2022'
    },
    plugins: [
      federation({
        name,
        filename,
        exposes,
        remotes,
        shared: { ...SHARED_SINGLETONS, ...shared }
      })
    ]
  });
}

export { defineConfig };
