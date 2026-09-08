import type { Locale } from '../lib/format';
import { localePath } from '../lib/format';
import { shellUrl } from '../lib/site';

import LocaleSwitcher from './LocaleSwitcher';
import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';

/** Copy header — vi là brand voice mặc định, en dịch khi có bản (static Task 10). */
const LABELS: Record<
  Locale,
  { ticker: string; cart: string; account: string; categories: string; newArrivals: string; bestSellers: string }
> = {
  vi: {
    ticker: 'CHÍNH HÃNG · FREESHIP',
    cart: 'Giỏ hàng',
    account: 'Tài khoản',
    categories: 'Danh mục',
    newArrivals: 'Hàng mới',
    bestSellers: 'Bán chạy',
  },
  en: {
    ticker: 'OFFICIAL · FREESHIP',
    cart: 'Cart',
    account: 'Account',
    categories: 'Categories',
    newArrivals: 'New arrivals',
    bestSellers: 'Best sellers',
  },
};

/**
 * Header sticky 2 hàng (direction §2.1): logo wordmark 26px/800 primary +
 * chấm đỏ 9px + ticker primary-tint → SearchBar (flex trung tâm) → actions.
 * Hàng 2 mini-nav nền primary; Hàng mới/Bán chạy màu accent. Mini-nav → PLP
 * /c/dien-tu — slug seed thật (SeedData "Điện Tử", probe SF-3); sort
 * newest/rating là values PlpSort thật (lib/plp-params).
 */
export default function Header({ locale }: { locale: Locale }) {
  const t = LABELS[locale];
  return (
    <header className="site-header">
      <div className="container header-main">
        <a className="logo" href={localePath('/', locale)} aria-label="Shop VN — trang chủ">
          <span className="logo-word">
            ShopVN
            <span className="logo-dot" aria-hidden="true" />
          </span>
          <span className="logo-ticker">{t.ticker}</span>
        </a>
        <SearchBar locale={locale} />
        <div className="header-actions">
          <LocaleSwitcher locale={locale} />
          {/* SF-15: dark mode toggle (persist + system-first). */}
          <ThemeToggle locale={locale} />
          <a className="header-action" href={`${shellUrl()}/cart`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9.5" cy="19.5" r="1.5" />
              <circle cx="16.5" cy="19.5" r="1.5" />
            </svg>
            {t.cart}
          </a>
          <a className="header-action" href={`${shellUrl()}/account`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" strokeLinecap="round" />
            </svg>
            {t.account}
          </a>
        </div>
      </div>
      {/* Mini-nav → PLP flagship /c/dien-tu (khớp convention hero CTA; slug
          seed thật). Sort newest/rating proxy Hàng mới/Bán chạy (API chưa có
          sort bestseller); route "toàn sàn" chưa có — khi có thì trỏ đó. */}
      <nav className="mini-nav" aria-label="Danh mục nhanh">
        <div className="container mini-nav-inner">
          <a href={localePath('/c/dien-tu', locale)}>{t.categories}</a>
          <a className="accent" href={localePath('/c/dien-tu?sort=newest', locale)}>{t.newArrivals}</a>
          <a className="accent" href={localePath('/c/dien-tu?sort=rating', locale)}>{t.bestSellers}</a>
        </div>
      </nav>
    </header>
  );
}
