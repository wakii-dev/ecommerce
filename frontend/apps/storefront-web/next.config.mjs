/** @type {import('next').NextConfig} */
const nextConfig = {
  // Các workspace package ship raw TS entry (main: ./src/index.ts) — Next
  // KHÔNG transpile TS của linked packages theo mặc định (Conventions #10).
  transpilePackages: ['@ecommerce/ui-kit', '@ecommerce/contracts', '@ecommerce/i18n'],
  async rewrites() {
    // Client components gọi relative `/api/...` — proxy qua gateway, tránh
    // cross-origin :3000→:8080 (Conventions #10). Server components vẫn fetch
    // trực tiếp GATEWAY_URL (lib/catalog-api.ts).
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.GATEWAY_URL || 'http://localhost:8080'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
