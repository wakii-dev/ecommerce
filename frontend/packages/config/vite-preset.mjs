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
  // 1 instance authStore/ui-kit/i18n toàn app — remote KHÔNG mang bản riêng.
  '@ecommerce/auth': { singleton: true, requiredVersion: false },
  '@ecommerce/ui-kit': { singleton: true, requiredVersion: false },
  '@ecommerce/i18n': { singleton: true, requiredVersion: false }
};

// FI-399: 127.0.0.1 vs localhost = 2 cookie host — dev mở bằng 127.0.0.1 sẽ vỡ
// session sync. Redirect 308 về localhost giữ port/path/query (proxy /api không
// đổi — redirect xảy ra trước). ws upgrade (HMR) không redirect. PRE middleware
// — chạy trước spa-fallback/transform (plugin order = mfeConfig.plugins rồi app
// plugins; configureServer hook chạy theo thứ tự plugin).
function redirect127ToLocalhostPlugin() {
  return {
    name: 'redirect-127-to-localhost',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.headers.upgrade === 'websocket') return next();
        const host = req.headers.host ?? '';
        // URL-parse (security-audit P2-1): chặn userinfo smuggling
        // (Host: 127.0.0.1:5573@evil.com — slice prefix sẽ sinh Location với
        // authority evil.com). Port CHỈ nhận ^:\\d+$ (regex neo cũng chặn
        // 127.0.0.10).
        let hostName = '';
        let port = '';
        try {
          const parsed = new URL(`http://${host}`);
          hostName = parsed.hostname;
          port = /^\d+$/.test(parsed.port) ? `:${parsed.port}` : ''; // URL.port là digits (không ':')
        } catch {
          return next();
        }
        if (hostName !== '127.0.0.1') return next();
        res.writeHead(308, { Location: `http://localhost${port}${req.url ?? '/'}` });
        res.end();
      });
    }
  };
}

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
        shared: { ...SHARED_SINGLETONS, ...shared },
        // SF-3 (FI-400) 1-origin dev entry: bật HMR remote — strategy
        // 'full-reload' (probe FI-400: native/react-refresh KHÔNG deliver cho
        // module load qua federation runtime vào host page; full-reload là
        // cơ chế cross-federation chính thức của plugin — relay Node-to-Node
        // ws://clientPort bypass entry, remote edit → trang shell tự reload).
        // Không bật → plugin bỏ qua toàn bộ plumbing remote-HMR (check
        // isRemoteHmrEnabled đứng trước mọi setup).
        dev: { remoteHmr: 'full-reload' }
      }),
      // SF-2 (FI-399): redirect 127.0.0.1 → localhost trên mọi MFE dev server
      redirect127ToLocalhostPlugin()
    ]
  });
}

export { defineConfig };
