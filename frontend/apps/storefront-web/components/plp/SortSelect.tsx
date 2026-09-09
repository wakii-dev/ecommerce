'use client';

import { useRouter } from 'next/navigation';

import type { Locale } from '../../lib/format';
import { t, type I18nKey } from '../../lib/i18n';
import type { PlpSort } from '../../lib/plp-params';

/**
 * Sort select — CLIENT (interaction duy nhất của PLP cần JS: onChange →
 * navigate URL mới, giữ filters, reset page). Hướng URL-driven như sidebar:
 * không state client, server render lại theo query mới (plan Task 12).
 * FI-392 T1: router.push (SPA nav, scroll:false) thay window.location.assign
 * — không còn reload trắng; URL vẫn là state (share/bookmark giữ nguyên).
 * T12: labels trong lib/i18n (miền `plp`).
 */
const SORT_KEYS: Record<PlpSort, I18nKey> = {
  price_asc: 'plp.sortPriceAsc',
  price_desc: 'plp.sortPriceDesc',
  rating: 'plp.sortRating',
  newest: 'plp.sortNewest',
  discount: 'plp.sortDiscount',
};

export interface SortSelectProps {
  value: PlpSort;
  locale: Locale;
}

export default function SortSelect({ value, locale }: SortSelectProps) {
  const router = useRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const url = new URL(window.location.href);
    url.searchParams.set('sort', event.target.value);
    url.searchParams.delete('page'); // đổi sort → kết quả đổi → về trang 1
    router.push(url.toString(), { scroll: false });
  }

  return (
    <label className="plp-sort">
      <span className="plp-sort-label">{t(locale, 'plp.sortBy')}</span>
      <select value={value} onChange={handleChange} aria-label={t(locale, 'plp.sortBy')}>
        {(Object.keys(SORT_KEYS) as PlpSort[]).map((key) => (
          <option key={key} value={key}>
            {t(locale, SORT_KEYS[key])}
          </option>
        ))}
      </select>
    </label>
  );
}
