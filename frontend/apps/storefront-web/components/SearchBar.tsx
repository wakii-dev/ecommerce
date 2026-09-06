'use client';

import type { Locale } from '../lib/format';

const PLACEHOLDER: Record<Locale, string> = {
  vi: 'Tìm sản phẩm, thương hiệu...',
  en: 'Search products, brands...',
};

/**
 * Stub Task 10 — form GET `/search?q=` (middleware rewrite giữ URL + query).
 * Dropdown suggest đầy đủ (debounce + suggestProducts, tag ĐANG HOT) landed
 * Task 14 — anatomy viền 2px primary theo direction §2.1.
 */
export default function SearchBar({ locale }: { locale: Locale }) {
  const placeholder = PLACEHOLDER[locale];
  return (
    <form className="search-form" action="/search" method="get" role="search">
      <input
        className="search-input"
        type="search"
        name="q"
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
      />
      <button className="search-btn" type="submit" aria-label="Tìm kiếm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
