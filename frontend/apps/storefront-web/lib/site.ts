/**
 * URL gốc tuyệt đối của storefront — dùng cho metadataBase, hreflang,
 * sitemap/robots. env SITE_URL (prod) default http://localhost:3000 (dev).
 * Đọc env LÚC GỌI (không snapshot import-time) để unit test override được.
 */
export function siteUrl(): string {
  return process.env.SITE_URL || 'http://localhost:3000';
}
