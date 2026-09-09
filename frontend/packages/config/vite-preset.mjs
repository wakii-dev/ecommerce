// Vite preset dùng chung cho mọi app MFE — plugin Module Federation import
// SẴN ở đây (R3): SF-2 federation harness + các remote chỉ gọi hàm, không tự
// wire MF.
//
// ⚠ Package ĐÚNG cho Vite là `@module-federation/vite` (export `federation`).
// `@module-federation/enhanced` CHỈ cho webpack — không có export chạy được
// với Vite (review FI-311 round 2 xác minh qua node import thật).
//
// Pattern shared singletons là BẮT BUỘC (spec R7 — 1 bản react/react-dom/
// query/i18n toàn app). react-router-dom CỐ Ý KHÔNG shared — routing là của
// shell, mỗi remote không được mang router riêng vào host.
//
// Dùng trong app:
//   import { defineMfeConfig } from '@ecommerce/config/vite';
//   export default defineMfeConfig({ name: 'mfe_storefront', exposes: {...} });
import { defineConfig } from 'vite';
import { federation } from '@module-federation/vite';

const SHARED_SINGLETONS = {
  react: { singleton: true, requiredVersion: false },
  'react-dom': { singleton: true, requiredVersion: false },
  '@tanstack/react-query': { singleton: true, requiredVersion: false },
  i18next: { singleton: true, requiredVersion: false },
  'react-i18next': { singleton: true, requiredVersion: false },
  // Workspace packages dùng xuyên MF boundary (SF-2 Task 14 pack pin):
  // 1 instance authStore/ui-kit/i18n/chrome toàn app — remote KHÔNG mang bản riêng.
  '@ecommerce/auth': { singleton: true, requiredVersion: false },
  '@ecommerce/ui-kit': { singleton: true, requiredVersion: false },
  '@ecommerce/i18n': { singleton: true, requiredVersion: false },
  '@ecommerce/chrome': { singleton: true, requiredVersion: false }
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
