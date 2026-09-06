// lib/format.ts — format helpers admin (VND / ngày giờ). Node-safe (Intl
// trong hàm — không top-level, D16).

/** 1290000 → "1.290.000 ₫" (Intl vi-VN VND — cache formatter). */
const vndFormatter = new Map<string, Intl.NumberFormat>();

export function formatVnd(value: number, locale = 'vi-VN'): string {
  let formatter = vndFormatter.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' });
    vndFormatter.set(locale, formatter);
  }
  return formatter.format(value);
}

/** ISO → "05/09/2026 14:05" (vi-VN, giờ local). */
export function formatDateTime(iso: string, locale = 'vi-VN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

/** ISO → "05/09/2026". */
export function formatDate(iso: string, locale = 'vi-VN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(iso));
}

/** yyyy-mm-dd của Date (local) — key lọc ngày orders/dashboard. */
export function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
