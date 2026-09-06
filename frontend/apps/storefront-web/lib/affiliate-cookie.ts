// lib/affiliate-cookie.ts (SF-12) — logic cookie attribution ?ref ở middleware,
// tách PURE để unit test được (vitest node env — pattern tests/unit.test.ts).
//
// Luồng: middleware thấy ?ref → POST /api/affiliate/track/click (affiliate-service
// ghi click + trả Set-Cookie aff_ref) → middleware forward cookie lên browser và
// REDIRECT 307 về URL sạch.
//
// httpOnly: contract affiliate.yaml ghi service Set-Cookie httpOnly — KHÔNG đổi.
// Nhưng storefront middleware re-set cookie cho JS ĐỌC ĐƯỢC (httpOnly:false):
// checkout đọc document.cookie để gắn affiliate_code vào POST /orders (SF-10
// live wiring dùng chung). httpOnly chặn document.cookie KỂ CẢ same-origin —
// review P0 FI-322. Giá trị cookie là ref code công khai (nằm trong URL share).

/** Kết quả capture: có cookie mới / service trả không-cookie (code sai/suspend) / lỗi mạng. */
export type CaptureResult =
  | { kind: 'set'; setCookie: string }
  | { kind: 'absent' }
  | { kind: 'error' };

/** Cookie attribute plan cho response — apply bằng response.cookies.set(). */
export interface AffiliateCookiePlan {
  name: string;
  value: string;
  maxAge?: number;
  httpOnly: false;
  path: '/';
  sameSite: 'lax';
}

/**
 * Parse Set-Cookie header của affiliate-service → plan cookie JS-readable.
 * Trả null nếu header không parse được (không name=value ở phần đầu).
 */
export function parseAffiliateSetCookie(setCookie: string): AffiliateCookiePlan | null {
  const parts = setCookie.split(';');
  const pair = parts[0] ?? '';
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name || !value) return null;
  const maxAgeAttr = parts
    .slice(1)
    .map((a) => a.trim().toLowerCase())
    .find((a) => a.startsWith('max-age='));
  const maxAgeRaw = maxAgeAttr?.slice('max-age='.length);
  const maxAge = maxAgeRaw !== undefined && maxAgeRaw !== '' && Number.isFinite(Number(maxAgeRaw))
    ? Number(maxAgeRaw)
    : undefined;
  return { name, value, maxAge, httpOnly: false, path: '/', sameSite: 'lax' };
}

/**
 * Quyết định action cookie cho response sau capture:
 * - set    → apply plan (attribution mới)
 * - clear  → CHỈ khi service trả 204 KHÔNG cookie (code sai/SUSPENDED) mà
 *            browser đang giữ attribution cũ → xoá (không giữ attribution chết)
 * - keep   → gateway chết/timeout (lỗi tạm thời) → GIỮ attribution cũ
 *            (khách hợp lệ không mất hoa hồng vì một blip — review P1-1)
 */
export function nextAffiliateCookieAction(
  capture: CaptureResult,
  hasExistingCookie: boolean
): { action: 'set'; plan: AffiliateCookiePlan } | { action: 'clear' } | { action: 'keep' } {
  if (capture.kind === 'set') {
    const plan = parseAffiliateSetCookie(capture.setCookie);
    if (plan) return { action: 'set', plan };
    return hasExistingCookie ? { action: 'keep' } : { action: 'keep' };
  }
  if (capture.kind === 'absent') {
    return hasExistingCookie ? { action: 'clear' } : { action: 'keep' };
  }
  return { action: 'keep' };
}
