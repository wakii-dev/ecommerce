/** Locale storefront — chỉ vi|en (Conventions #2, D17 resolve backend cùng enum). */
export type Locale = 'vi' | 'en';

/** Parse segment `[locale]` → Locale; segment khác vi/en → null (layout notFound). */
export function resolveLocale(segment: string | undefined): Locale | null {
  return segment === 'vi' || segment === 'en' ? segment : null;
}

/**
 * Giá VND — dấu chấm ngăn nghìn + khoảng trắng trước ₫
 * (direction §3: `1.290.000 ₫` — khớp primitive Price vi-VN).
 * Tự chia nhóm thay vì Intl.NumberFormat để deterministic mọi môi trường ICU.
 */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = Math.abs(Math.trunc(amount)).toString();
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.push(digits.slice(Math.max(0, end - 3), end));
  }
  return `${sign}${groups.reverse().join('.')} ₫`;
}

/**
 * Đường path theo locale (Task 10: locale-switcher header):
 * vi → path nguyên bản (không prefix — middleware rewrite `/`→`/vi`);
 * en → prefix `/en` — giữ nguyên `/` dẫn đầu (`/c/foo` → `/en/c/foo`),
 * root `/` → `/en/` (plan Task 10: không link `/en` bare).
 */
export function localePath(path: string, locale: Locale): string {
  if (locale !== 'en') return path;
  return path === '/' ? '/en/' : `/en${path}`;
}
