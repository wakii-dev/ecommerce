import type { Locale } from './format';
import { DEFAULT_SORT, PLP_SORTS, type PlpSort, type RawSearchParams } from './plp-params';

/**
 * Helpers trang /search + dropdown suggest (Task 14) — parse/URL thuần (pure,
 * unit-test được, không đụng React/next).
 */

/** Query trang tìm kiếm — q đã trim (rỗng = chưa nhập), page/sort garbage-tolerant như PLP. */
export interface SearchPageQuery {
  q: string;
  page: number;
  sort: PlpSort;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/** Parse searchParams trang /search: q trim, sort lạ → newest, page ≤0/NaN → 1. */
export function parseSearchPageParams(searchParams: RawSearchParams): SearchPageQuery {
  const q = (firstValue(searchParams.q) ?? '').trim();

  const sortRaw = firstValue(searchParams.sort);
  const sort: PlpSort = PLP_SORTS.includes(sortRaw as PlpSort) ? (sortRaw as PlpSort) : DEFAULT_SORT;

  const pageRaw = Number.parseInt(firstValue(searchParams.page) ?? '', 10);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { q, page, sort };
}

/** URL suggest client component — RELATIVE qua Next rewrites proxy → gateway (same-origin). */
export function suggestUrl(q: string, locale: Locale): string {
  return `/api/catalog/search/suggest?q=${encodeURIComponent(q)}&locale=${locale}`;
}

/**
 * Di chuyển highlight listbox suggest (pure): wrap vòng; length 0 → -1;
 * chưa chọn (-1) + ArrowDown → 0, ArrowUp → phần tử cuối.
 */
export function moveActive(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  const next = current + delta;
  if (next < 0) return length - 1;
  if (next >= length) return 0;
  return next;
}

/** Chips gợi ý từ khóa khi 0 kết quả (direction Task 14: điện thoại/áo thun/sách). */
export const SEARCH_SUGGESTED_KEYWORDS: Record<Locale, readonly string[]> = {
  vi: ['điện thoại', 'áo thun', 'sách'],
  en: ['phone', 't-shirt', 'books'],
};
