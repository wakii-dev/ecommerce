'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { resolveTheme, storedValueFor, type Theme } from '../lib/theme';

const COPY = {
  vi: { toDark: 'Chuyển giao diện tối', toLight: 'Chuyển giao diện sáng' },
  en: { toDark: 'Switch to dark mode', toLight: 'Switch to light mode' },
} as const;

export const THEME_STORAGE_KEY = 'ecommerce.theme';

/** Boot script chống FOUC — chèn sớm trong root layout (trước paint). */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;t=(t==='dark'||(!t&&d))?'dark':'storefront';document.documentElement.dataset.theme=t;}catch(e){}})();`;

/**
 * Toggle dark mode (SF-15): data-theme storefront ↔ dark trên <html>,
 * persist localStorage['ecommerce.theme'] — chỉ ghi khi user đi NGƯỢC
 * system (storedValueFor) → reload giữ nguyên ✓, lần đầu theo system ✓.
 */
export default function ThemeToggle({ locale }: { locale: 'vi' | 'en' }): ReactElement {
  const [theme, setTheme] = useState<Theme>('storefront');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY), prefersDark));
    setMounted(true);
  }, []);

  const toggle = (): void => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next: Theme = theme === 'dark' ? 'storefront' : 'dark';
    document.documentElement.dataset.theme = next;
    const stored = storedValueFor(next, prefersDark);
    try {
      if (stored === null) window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    } catch {
      // private mode — theme vẫn đổi cho phiên này
    }
    setTheme(next);
  };

  const copy = COPY[locale];
  return (
    <button
      type="button"
      className="header-action theme-toggle"
      aria-label={theme === 'dark' ? copy.toLight : copy.toDark}
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? copy.toLight : copy.toDark}
      onClick={toggle}
      data-mounted={mounted}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        {theme === 'dark' ? (
          // mặt trời
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2" strokeLinecap="round" />
          </>
        ) : (
          // mặt trăng
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
        )}
      </svg>
      {locale === 'vi' ? (theme === 'dark' ? 'Sáng' : 'Tối') : theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
