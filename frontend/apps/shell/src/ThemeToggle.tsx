import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

/**
 * Dark mode toggle của shell (SF-15) — đăng ký HeaderSlots 'right' từ main.tsx
 * (registry pattern như ShellNav/AuthWidget). data-theme storefront ↔ dark
 * trên <html>; persist localStorage['ecommerce.theme'] — chỉ ghi khi user đi
 * NGƯỢC prefers-color-scheme (reload giữ nguyên, lần đầu theo system).
 */
export const THEME_STORAGE_KEY = 'ecommerce.theme';

type Theme = 'storefront' | 'dark';

function current(prefersDark: boolean): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark') return 'dark';
    if (stored === 'light') return 'storefront';
  } catch {
    // private mode — theo system
  }
  return prefersDark ? 'dark' : 'storefront';
}

export default function ThemeToggle(): ReactElement {
  const [theme, setTheme] = useState<Theme>('storefront');

  useEffect(() => {
    setTheme(current(window.matchMedia('(prefers-color-scheme: dark)').matches));
  }, []);

  const toggle = (): void => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next: Theme = theme === 'dark' ? 'storefront' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      // ghi chỉ khi đi ngược system; cùng chiều system → xóa (theo system lại)
      if ((next === 'dark') === prefersDark) window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next === 'dark' ? 'dark' : 'light');
    } catch {
      // private mode
    }
    setTheme(next);
  };

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
      aria-pressed={dark}
      title={dark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        fontSize: 'var(--text-md, 14px)',
        color: 'var(--c-text, #212121)',
        background: 'transparent',
        border: '1px solid var(--c-border, #eeeeee)',
        borderRadius: 'var(--radius-sm, 2px)',
        cursor: 'pointer',
      }}
    >
      {dark ? '☀️' : '🌙'}
      <span>{dark ? 'Sáng' : 'Tối'}</span>
    </button>
  );
}
