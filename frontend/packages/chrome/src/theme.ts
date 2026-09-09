/**
 * Theme canonical logic (FI-398 T7, spec §3.5) — port EXACT từ shell
 * ThemeToggle.tsx (`current()` + nhánh storage trong `toggle()`) + boot script
 * shell index.html (anti-FOUC SF-15). Pure module — KHÔNG JSX, KHÔNG
 * window/localStorage lúc import; component truyền storage/prefers vào.
 *
 * Key canonical 'ecommerce.theme' — duy nhất trên cả 3 vị trí hiện có (shell
 * toggle, shell index.html boot, storefront lib/theme.ts — đã probe, KHÔNG có
 * key khác → không cần read-order migration). Shell index.html inline boot
 * GIỮ NGUYÊN (SF-4 flip sang THEME_BOOT_SCRIPT khi layout swap — cùng literal
 * nên zero behavioral drift, FLAG F4).
 */

/** Storage key canonical — literal duy nhất cho toggle + boot script. */
export const THEME_STORAGE_KEY = 'ecommerce.theme';

/** 'storefront' = theme sáng mặc định (data-theme storefront), 'dark' = tối. */
export type Theme = 'storefront' | 'dark';

/**
 * Port EXACT `current()` (shell ThemeToggle): stored 'dark' → dark; 'light' →
 * storefront; thiếu/junk → theo hệ thống (prefersDark).
 */
export function resolveTheme(storage: string | null, prefersDark: boolean): Theme {
  if (storage === 'dark') return 'dark';
  if (storage === 'light') return 'storefront';
  return prefersDark ? 'dark' : 'storefront';
}

/**
 * Port EXACT nhánh storage trong `toggle()` (shell ThemeToggle): ghi CHỈ khi
 * user đi NGƯỢC prefers-color-scheme (reload giữ lựa chọn); cùng chiều system
 * → null (caller xóa key — theo system lại). Giá trị persist 'dark'/'light'.
 */
export function storedThemeValue(theme: Theme, prefersDark: boolean): string | null {
  if ((theme === 'dark') === prefersDark) return null;
  return theme === 'dark' ? 'dark' : 'light';
}

/**
 * Boot script anti-FOUC — nội dung khớp VERBATIM inline script shell
 * index.html (1 nguồn; shell host NHÚNG chuỗi này — SF-4 flip). Set
 * data-theme TRƯỚC paint: localStorage → prefers-color-scheme → storefront.
 */
export const THEME_BOOT_SCRIPT = `(function () {
  try {
    var t = localStorage.getItem('ecommerce.theme');
    var d = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    t = t === 'dark' || (!t && d) ? 'dark' : 'storefront';
    document.documentElement.dataset.theme = t;
  } catch (e) {
    /* private mode */
  }
})();`;
