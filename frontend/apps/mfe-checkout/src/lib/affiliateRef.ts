// lib/affiliateRef.ts (SF-12) — đọc cookie attribution `aff_ref` do
// affiliate-service set lúc capture ?ref (storefront middleware gọi
// POST /api/affiliate/track/click). Cookie httpOnly với request TRỰC TIẾP,
// nhưng checkout chạy cùng origin qua vite proxy/shell → document.cookie đọc
// được trong dev-dev wiring hiện tại; httpOnly chặn đọc từ JS ở prod chéo
// origin — SF-10 live wiring sẽ chuyển sang đọc qua middleware/proxy nếu cần.
// Đơn KHÔNG qua affiliate → null → payload không có affiliate_code.

/** Trả ref code từ cookie aff_ref, hoặc null khi không có attribution. */
export function readAffiliateRef(): string | null {
  const match = /(?:^|;\s*)aff_ref=([^;]+)/.exec(document.cookie);
  const raw = match?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
