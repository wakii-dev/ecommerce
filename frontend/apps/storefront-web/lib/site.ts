/**
 * URL gốc tuyệt đối của storefront — dùng cho metadataBase, hreflang,
 * sitemap/robots. env SITE_URL (prod) default http://localhost:3000 (dev).
 * Đọc env LÚC GỌI (không snapshot import-time) để unit test override được.
 */
export function siteUrl(): string {
  return process.env.SITE_URL || 'http://localhost:3000';
}

/**
 * Origin của SHELL (cart/checkout/account là trang shell Vite MF — KHÔNG phải
 * route Next; link relative '/cart' 404 trên mọi dev topology — code-review
 * SF-6 P1). env NEXT_PUBLIC_SHELL_URL (Next: chỉ NEXT_PUBLIC_* expose client),
 * default http://localhost:5173 theo .env.example. Đọc lúc gọi như siteUrl.
 */
export function shellUrl(): string {
  return process.env.NEXT_PUBLIC_SHELL_URL || 'http://localhost:5173';
}
