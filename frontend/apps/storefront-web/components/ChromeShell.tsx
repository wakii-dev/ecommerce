'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { initI18n } from '@ecommerce/i18n';
import {
  Footer,
  SessionBootProvider,
  SiteHeader,
  ThemeToggle,
  localePath,
  setChromeSite,
  shellUrl,
} from '@ecommerce/chrome';

import { t } from '../lib/i18n';
import LocaleSwitcher from './LocaleSwitcher';
import NewsletterForm from './NewsletterForm';
import SearchBar from './SearchBar';

type Locale = 'vi' | 'en';

/**
 * ChromeShell (SF-4 FI-401) — client gate bọc chrome tree: initI18n +
 * changeLanguage (URL locale — P0-2 critic: initI18n memoized first-call-wins
 * nên init một mình KHÔNG đủ khi SPA-nav đổi locale) + setChromeSite
 * (same-origin relative). Server layout gọi CÙNG bộ trước render (SSR pass
 * chắc chắn dịch — chrome instance là singleton PER RUNTIME, server khác
 * browser). SessionBootProvider mount không options — co-exist với
 * lib/account-session (cùng refreshUrl; authStore.refresh single-flight
 * per-tab → không double POST; loginPath default '/login' inert — chỉ
 * AdminApp đọc getLoginPath).
 *
 * Header: chrome SiteHeader props-slots (SSR render props TRƯỚC registry SAU
 * — links vào HTML đầu cho nav-honesty/SEO). Slot components mỏng 0-arg —
 * SiteHeader render <Component /> KHÔNG props → locale đọc qua useParams().
 * Class FI-390 GIỮ NGUYÊN (.logo, .search-*, .header-actions, .header-action,
 * .locale-switch, .mini-nav) — chỉ scaffolding wrapper đổi sang chrome
 * (.chrome-header + .site-header cùng element; app.css import SAU chrome.css
 * → storefront values thắng).
 *
 * Footer: chrome Footer (labels chrome.footer.* — đi qua t-provider; sửa 1
 * nhãn đổi CẢ 2 app) + NewsletterForm island (SF-13 — chrome không render,
 * pack để SF-4 quyết) trong cùng band .site-footer--chrome.
 */

function useLocaleFromParams(): Locale {
  const params = useParams();
  return params?.locale === 'en' ? 'en' : 'vi';
}

function SlotLogo(): ReactElement {
  const locale = useLocaleFromParams();
  return (
    <Link className="logo" href={localePath('/', locale)} aria-label={t(locale, 'header.logo')}>
      <span className="logo-word">
        ShopVN
        <span className="logo-dot" aria-hidden="true" />
      </span>
      <span className="logo-ticker">{t(locale, 'header.ticker')}</span>
    </Link>
  );
}

function SlotSearch(): ReactElement {
  const locale = useLocaleFromParams();
  return <SearchBar locale={locale} />;
}

/** Actions nguyên khối — markup cũ .header-actions giữ nguyên vị trí class. */
function SlotActions(): ReactElement {
  const locale = useLocaleFromParams();
  return (
    <div className="header-actions">
      <LocaleSwitcher locale={locale} />
      {/* SF-4: chrome ThemeToggle (icon-only 42×42 — FI-390 direction §2.1; label
          Tối/Sáng cũ thành sr-only — delta CHẤP NHẬN theo direction). */}
      <ThemeToggle />
      {/* Cart/account GIỮ LINK relative (pack item 8: chrome Header phải render
          links /cart|/account tương tự — nav-honesty). */}
      <a className="header-action" href={`${shellUrl()}/cart`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="19.5" r="1.5" />
          <circle cx="16.5" cy="19.5" r="1.5" />
        </svg>
        <span className="header-action-label">{t(locale, 'header.cart')}</span>
      </a>
      <a className="header-action" href={`${shellUrl()}/account`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" strokeLinecap="round" />
        </svg>
        <span className="header-action-label">{t(locale, 'header.account')}</span>
      </a>
    </div>
  );
}

/** Mini-nav (row2) — markup cũ GIỮ (e2e `nav.mini-nav` 3 link sort thật). */
function SlotMiniNav(): ReactElement {
  const locale = useLocaleFromParams();
  return (
    <nav className="mini-nav" aria-label={t(locale, 'header.quickNav')}>
      <div className="container mini-nav-inner">
        <Link href={localePath('/c/dien-tu', locale)}>{t(locale, 'header.categories')}</Link>
        <Link className="accent" href={localePath('/c/dien-tu?sort=newest', locale)}>{t(locale, 'header.newArrivals')}</Link>
        <Link className="accent" href={localePath('/c/dien-tu?sort=rating', locale)}>{t(locale, 'header.bestSellers')}</Link>
      </div>
    </nav>
  );
}

export default function ChromeShell({ locale, children }: { locale: Locale; children: ReactNode }): ReactElement {
  // Per-render idempotent (first-call-wins instance + merge-config) — chạy
  // TRƯỚC children render nên chrome helpers đọc đúng config cả SSR lẫn browser.
  setChromeSite({ sfUrl: '', shellUrl: '' });
  void initI18n({ lang: locale }).then((i18n) => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  });
  return (
    <SessionBootProvider>
      <SiteHeader
        className="site-header"
        slots={{ left: [SlotLogo], center: [SlotSearch], right: [SlotActions] }}
        row2={<SlotMiniNav />}
      />
      {children}
      <div className="site-footer site-footer--chrome">
        <Footer />
        {/* Newsletter (SF-13 island) — chrome footer grid track 3 rỗng chủ đích
            (chrome.css comment); đặt dưới 2 cột link trong cùng band #212121.
            Delta layout: newsletter chuyển từ cột 3 xuống full-width row —
            direction FI-390 không định nghĩa footer → chấp nhận, so screenshot. */}
        <div className="container site-footer__newsletter">
          <NewsletterForm locale={locale} />
        </div>
      </div>
    </SessionBootProvider>
  );
}
