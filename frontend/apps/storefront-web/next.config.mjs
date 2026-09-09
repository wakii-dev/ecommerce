/** @type {import('next').NextConfig} */
const nextConfig = {
  // Các workspace package ship raw TS entry (main: ./src/index.ts) — Next
  // KHÔNG transpile TS của linked packages theo mặc định (Conventions #10).
  transpilePackages: ['@ecommerce/ui-kit', '@ecommerce/contracts', '@ecommerce/i18n', '@ecommerce/auth', '@ecommerce/chrome'],
  // SF-10 (profile full): container riêng chạy `node server.js` từ
  // .next/standalone (pack item 3 — next build standalone).
  output: 'standalone',
  async rewrites() {
    // Client components gọi relative `/api/...` — proxy qua gateway, tránh
    // cross-origin :3000→:8080 (Conventions #10). Server components vẫn fetch
    // trực tiếp GATEWAY_URL (lib/catalog-api.ts). SF-13: ảnh upload MinIO
    // `/media/**` cũng relative từ URL API → proxy cùng gateway (route /media).
    //
    // SF-3 (FI-400) dev 1-origin entry :3000 — APPEND shell-routes (KHÔNG đổi
    // /api + /media). Mirror gateway predicate shell-web (gateway-routes.yml)
    // + route table đầy đủ apps/shell/src/App.tsx:156-289. Prod KHÔNG đi qua
    // đây (gateway route shell → nginx trực tiếp) — entry rewrites chỉ sống
    // ở dev/standalone-manifest.
    //
    // D3 two-slot: destination LUÔN absolute — env SHELL_ORIGIN/REMOTE_*_URL
    // chỉ dùng khi khớp http(s) (chế độ legacy 2-origin); giá trị relative
    // `/remotes/<name>` (mặc định mới .env.example) hoặc unset → default
    // absolute port. Rewrite /remotes/<name>/ GIỮ prefix (remote dev server
    // chạy base /remotes/<name>/ — mirror prod bake `--base` Dockerfile.web).
    const httpUrl = (raw, fallback) =>
      raw && /^https?:\/\//.test(raw) ? raw.replace(/\/$/, '') : fallback;
    const SHELL = httpUrl(process.env.SHELL_ORIGIN, 'http://localhost:5173');
    const CHECKOUT = httpUrl(process.env.REMOTE_CHECKOUT_URL, 'http://localhost:5175');
    const ACCOUNT = httpUrl(process.env.REMOTE_ACCOUNT_URL, 'http://localhost:5176');
    const ADMIN = httpUrl(process.env.REMOTE_ADMIN_URL, 'http://localhost:5177');
    const SKELETON = httpUrl(process.env.REMOTE_SKELETON_URL, 'http://localhost:5178');
    const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${GATEWAY}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${GATEWAY}/media/:path*`,
      },
      // ── shell pages (route table apps/shell/src/App.tsx:156-289; `/:path*`
      //    zero-or-more phủ cả bare) ──
      { source: '/admin/:path*', destination: `${SHELL}/admin/:path*` },
      { source: '/account/:path*', destination: `${SHELL}/account/:path*` },
      { source: '/cart/:path*', destination: `${SHELL}/cart/:path*` },
      { source: '/checkout/:path*', destination: `${SHELL}/checkout/:path*` },
      { source: '/order/confirmation/:path*', destination: `${SHELL}/order/confirmation/:path*` },
      // /login/:path* phủ /login + /login/2fa + /login/oauth/callback (SF-15)
      { source: '/login/:path*', destination: `${SHELL}/login/:path*` },
      { source: '/register', destination: `${SHELL}/register` },
      { source: '/forgot-password', destination: `${SHELL}/forgot-password` },
      { source: '/reset-password', destination: `${SHELL}/reset-password` },
      { source: '/skeleton', destination: `${SHELL}/skeleton` },
      { source: '/ui-kit', destination: `${SHELL}/ui-kit` },
      // ── shell dev assets (vite dev server root) + favicon parity gateway ──
      //    `/@…` là prefix shell owns trong dev: /@vite (client/env),
      //    /@id (MF virtual), /@fs (abs module), /@react-refresh.
      { source: '/@vite/:path*', destination: `${SHELL}/@vite/:path*` },
      { source: '/@id/:path*', destination: `${SHELL}/@id/:path*` },
      { source: '/@fs/:path*', destination: `${SHELL}/@fs/:path*` },
      { source: '/@react-refresh', destination: `${SHELL}/@react-refresh` },
      { source: '/src/:path*', destination: `${SHELL}/src/:path*` },
      // inline-script module của shell index.html (vite html-proxy)
      { source: '/index.html', destination: `${SHELL}/index.html` },
      { source: '/node_modules/:path*', destination: `${SHELL}/node_modules/:path*` },
      { source: '/assets/:path*', destination: `${SHELL}/assets/:path*` },
      { source: '/favicon.ico', destination: `${SHELL}/favicon.ico` },
      { source: '/favicon.svg', destination: `${SHELL}/favicon.svg` },
      // ── remotes same-origin qua entry — GIỮ prefix (remote base) ──
      { source: '/remotes/checkout/:path*', destination: `${CHECKOUT}/remotes/checkout/:path*` },
      { source: '/remotes/account/:path*', destination: `${ACCOUNT}/remotes/account/:path*` },
      { source: '/remotes/admin/:path*', destination: `${ADMIN}/remotes/admin/:path*` },
      { source: '/remotes/skeleton/:path*', destination: `${SKELETON}/remotes/skeleton/:path*` },
    ];
  },
};

export default nextConfig;
