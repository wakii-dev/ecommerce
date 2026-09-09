/**
 * URL gốc tuyệt đối của storefront — dùng cho metadataBase, hreflang,
 * sitemap/robots. env SITE_URL (prod) default http://localhost:3000 (dev).
 * Đọc env LÚC GỌI (không snapshot import-time) để unit test override được.
 */
export function siteUrl(): string {
  return process.env.SITE_URL || 'http://localhost:3000';
}

/**
 * Origin shell — SF-4 (FI-401): same-origin TUYỆT ĐỐI qua entry :3000
 * (SF-3). Kill-switch NEXT_PUBLIC_SHELL_URL ĐÃ XÓA (pack item 10 — code path
 * chết sau 1-origin; docker-compose env :502 prod GIỮ nguyên, code không đọc
 * nữa). Link `${shellUrl()}/cart` = `/cart` relative — KHÔNG bao giờ
 * protocol-relative `//cart` (site.test.ts guard).
 */
export function shellUrl(): string {
  return '';
}
