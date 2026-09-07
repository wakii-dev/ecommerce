import type { MetadataRoute } from 'next';

/**
 * Web app manifest (SF-15) — Next serve /manifest.webmanifest. Màu từ tokens
 * (--c-primary #F53D2D / --c-bg #F5F5F5). start_url có locale prefix (route
 * thật /vi — gateway middleware rewrite '/' → '/vi').
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ShopVN — Chợ sôi động',
    short_name: 'ShopVN',
    description: 'Hàng nghìn sản phẩm chính hãng, giá tốt mỗi ngày.',
    start_url: '/vi',
    scope: '/',
    display: 'standalone',
    background_color: '#F5F5F5',
    theme_color: '#F53D2D',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
