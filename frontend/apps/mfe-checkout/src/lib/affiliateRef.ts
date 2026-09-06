// lib/affiliateRef.ts (SF-12) — đọc cookie attribution `aff_ref` để gắn
// `affiliate_code` vào POST /orders (ordering.yaml — nullable). Cookie do
// affiliate-service set lúc capture ?ref; storefront middleware RE-SET bản
// JS-readable (httpOnly:false — review P0 FI-322: httpOnly chặn
// document.cookie kể cả same-origin, affiliateCode sẽ không bao giờ vào đơn)
// nên checkout đọc được. Đơn KHÔNG qua affiliate → null → không có field.

/** Trả ref code từ chuỗi cookie (mặc định document.cookie), hoặc null. */
export function readAffiliateRef(cookieSource?: string): string | null {
  const source = cookieSource ?? (typeof document !== 'undefined' ? document.cookie : '');
  const match = /(?:^|;\s*)aff_ref=([^;]+)/.exec(source);
  const raw = match?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
