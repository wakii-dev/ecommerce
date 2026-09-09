'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Icon } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { THEME_STORAGE_KEY, resolveTheme, storedThemeValue } from './theme';
import type { Theme } from './theme';

/**
 * Dark mode toggle (FI-398 T7 — port từ shell ThemeToggle, spec §3.5) —
 * đăng ký HeaderSlots 'right' từ shell main.tsx (registry pattern như
 * ShellNav/AuthWidget). data-theme storefront ↔ dark trên <html>; persist
 * localStorage[THEME_STORAGE_KEY='ecommerce.theme'] — chỉ ghi khi user đi
 * NGƯỢC prefers-color-scheme (reload giữ nguyên, lần đầu theo system) qua
 * storedThemeValue(). Icon sun/moon SVG (dark cascade qua stroke=
 * currentColor); icon-btn 42×42 qua .chrome-icon-btn (chrome.css) — labels
 * chrome.theme.* i18n (text vi GIỮ nguyên e2e-safe).
 */

/** Đọc storage an toàn (private mode → null — theo system). */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null; // private mode — theo system
  }
}

export function ThemeToggle(): ReactElement {
  const { t } = useT();
  const [theme, setTheme] = useState<Theme>('storefront');

  useEffect(() => {
    setTheme(resolveTheme(readStored(), window.matchMedia('(prefers-color-scheme: dark)').matches));
  }, []);

  const toggle = (): void => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next: Theme = theme === 'dark' ? 'storefront' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      // ghi chỉ khi đi ngược system; cùng chiều system → xóa (theo system lại)
      const value = storedThemeValue(next, prefersDark);
      if (value === null) window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // private mode
    }
    setTheme(next);
  };

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="chrome-icon-btn"
      onClick={toggle}
      aria-label={dark ? t('chrome.theme.toLight') : t('chrome.theme.toDark')}
      aria-pressed={dark}
      title={dark ? t('chrome.theme.toLight') : t('chrome.theme.toDark')}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={20} />
      <span className="chrome-vh">{dark ? t('chrome.theme.light') : t('chrome.theme.dark')}</span>
    </button>
  );
}

export default ThemeToggle;
