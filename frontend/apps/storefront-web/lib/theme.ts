/**
 * Theme resolve (SF-15 dark mode) — PURE, unit-test được (vitest node env).
 * Ưu tiên: localStorage['ecommerce.theme'] ('dark'|'light') → prefers-color-scheme
 * → mặc định 'storefront' (theme sáng). data-theme trên <html> chỉ 2 giá trị:
 * 'storefront' | 'dark' (ui-kit tokens: :root + [data-theme='dark']).
 */
export type Theme = 'storefront' | 'dark';

export function resolveTheme(storage: string | null, prefersDark: boolean): Theme {
  if (storage === 'dark') return 'dark';
  if (storage === 'light') return 'storefront';
  return prefersDark ? 'dark' : 'storefront';
}

/** Giá trị ghi localStorage khi user chọn tường minh (null = xóa → theo system). */
export function storedValueFor(theme: Theme, prefersDark: boolean): string | null {
  if (theme === 'dark') return prefersDark ? null : 'dark';
  return prefersDark ? 'light' : null;
}
