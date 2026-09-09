import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Icon } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';

/**
 * Dark mode toggle của shell (SF-15) — đăng ký HeaderSlots 'right' từ main.tsx
 * (registry pattern như ShellNav/AuthWidget). data-theme storefront ↔ dark
 * trên <html>; persist localStorage['ecommerce.theme'] — chỉ ghi khi user đi
 * NGƯỢC prefers-color-scheme (reload giữ nguyên, lần đầu theo system).
 * FI-393 T2: emoji ☀️/🌙 → Icon sun/moon (SVG, dark cascade qua
 * stroke=currentColor); icon-btn 42×42 qua .shell-icon-btn (header.css) —
 * labels shell.* i18n.
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
  const { t } = useT();
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
      className="shell-icon-btn"
      onClick={toggle}
      aria-label={dark ? t('shell.theme.toLight') : t('shell.theme.toDark')}
      aria-pressed={dark}
      title={dark ? t('shell.theme.toLight') : t('shell.theme.toDark')}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={20} />
      <span className="shell-vh">{dark ? t('shell.theme.light') : t('shell.theme.dark')}</span>
    </button>
  );
}
