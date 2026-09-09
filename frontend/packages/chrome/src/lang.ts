/**
 * Lang persist (FI-398 T12, spec §3.9) — localStorage['ecommerce.lang'].
 * Module thuần (KHÔNG JSX, KHÔNG window lúc import — hàm đọc-lúc-gọi, try/catch
 * private mode → null). Shell-model i18n-lang: LocaleSwitcher ghi, host đọc qua
 * storedLang() lúc bootstrap (`initI18n({ lang: storedLang() ?? 'vi' })`).
 */

/** Storage key lang — literal duy nhất (LocaleSwitcher ghi, storedLang đọc). */
export const LANG_STORAGE_KEY = 'ecommerce.lang';

/** Đọc lang đã lưu — thiếu/giá trị lạ/private mode → null (caller fallback 'vi'). */
export function storedLang(): 'vi' | 'en' | null {
  try {
    const value = window.localStorage.getItem(LANG_STORAGE_KEY);
    return value === 'vi' || value === 'en' ? value : null;
  } catch {
    return null; // private mode
  }
}
