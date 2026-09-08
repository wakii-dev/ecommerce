'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { Locale } from '../lib/format';
import { t } from '../lib/i18n';
import { resolveTheme, storedValueFor, type Theme } from '../lib/theme';

export const THEME_STORAGE_KEY = 'ecommerce.theme';

/** Boot script chống FOUC — chèn sớm trong root layout (trước paint). */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;t=(t==='dark'||(!t&&d))?'dark':'storefront';document.documentElement.dataset.theme=t;}catch(e){}})();`;

/**
 * Toggle dark mode (SF-15): data-theme storefront ↔ dark trên <html>,
 * persist localStorage['ecommerce.theme'] — chỉ ghi khi user đi NGƯỢC
 * system (storedValueFor) → reload giữ nguyên ✓, lần đầu theo system ✓.
 */
export default function ThemeToggle({ locale }: { locale: Locale }): ReactElement {
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

  const label = t(locale, theme === 'dark' ? 'common.themeToLight' : 'common.themeToDark');
  const stateLabel = t(locale, theme === 'dark' ? 'common.themeLight' : 'common.themeDark');
  return (
    <button
      type="button"
      className="header-action theme-toggle"
      aria-label={label}
      aria-pressed={theme === 'dark'}
      title={label}
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
      {/* Label bọc span để T13 ẩn icon-only <600px (sr-only — aria-label giữ name) */}
      <span className="header-action-label">{stateLabel}</span>
    </button>
  );
}
