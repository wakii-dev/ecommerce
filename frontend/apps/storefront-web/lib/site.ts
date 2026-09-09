/**
 * URL gốc tuyệt đối của storefront — dùng cho metadataBase, hreflang,
 * sitemap/robots. env SITE_URL (prod) default http://localhost:3000 (dev).
 * Đọc env LÚC GỌI (không snapshot import-time) để unit test override được.
 */
export function siteUrl(): string {
  return process.env.SITE_URL || 'http://localhost:3000';
}

/**
 * Origin của SHELL (cart/checkout/account là trang shell Vite MF). SF-3
 * (FI-400) 1-origin: default '' → link `shellUrl()+'/cart'` = `/cart`, đi qua
 * entry :3000 (Next rewrites proxy về shell Vite). env NEXT_PUBLIC_SHELL_URL
 * (Next: chỉ NEXT_PUBLIC_* expose client) giữ làm override — set absolute =
 * kill-switch chế độ 2-origin legacy cho links. Đọc lúc gọi như siteUrl
 * (không snapshot import-time) để unit test override được.
 */
export function shellUrl(): string {
  return process.env.NEXT_PUBLIC_SHELL_URL || '';
}
