'use client';

import type { Locale } from '../../lib/format';
import type { PlpSort } from '../../lib/plp-params';

/**
 * Sort select — CLIENT (interaction duy nhất của PLP cần JS: onChange →
 * navigate URL mới, giữ filters, reset page). Hướng URL-driven như sidebar:
 * không state client, server render lại theo query mới (plan Task 12).
 */
const SORT_LABELS: Record<PlpSort, Record<Locale, string>> = {
  price_asc: { vi: 'Giá: thấp → cao', en: 'Price: low → high' },
  price_desc: { vi: 'Giá: cao → thấp', en: 'Price: high → low' },
  rating: { vi: 'Đánh giá cao', en: 'Top rated' },
  newest: { vi: 'Mới nhất', en: 'Newest' },
  discount: { vi: 'Giảm nhiều', en: 'Biggest discount' },
};

export interface SortSelectProps {
  value: PlpSort;
  locale: Locale;
}

export default function SortSelect({ value, locale }: SortSelectProps) {
  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const url = new URL(window.location.href);
    url.searchParams.set('sort', event.target.value);
    url.searchParams.delete('page'); // đổi sort → kết quả đổi → về trang 1
    window.location.assign(url.toString());
  }

  return (
    <label className="plp-sort">
      <span className="plp-sort-label">{locale === 'en' ? 'Sort by' : 'Sắp xếp'}</span>
      <select value={value} onChange={handleChange} aria-label={locale === 'en' ? 'Sort by' : 'Sắp xếp'}>
        {(Object.keys(SORT_LABELS) as PlpSort[]).map((key) => (
          <option key={key} value={key}>
            {SORT_LABELS[key][locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
