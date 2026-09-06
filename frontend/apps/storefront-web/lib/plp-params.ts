import type { Category } from './catalog-api';

/**
 * PLP URL params = state (plan Task 12) — parse/serialize thuần (pure, unit-test
 * được, không đụng React/next). Schema listProducts hỗ trợ: category, minPrice,
 * maxPrice, minRating, brand, sort, page, size — KHÔNG có `official` (bỏ filter
 * này khỏi UI, không có gì để gửi API).
 */

export type PlpSort = 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'discount';

export const PLP_SORTS: readonly PlpSort[] = ['price_asc', 'price_desc', 'rating', 'newest', 'discount'];

export const DEFAULT_SORT: PlpSort = 'newest';

/** PLP render 12 sản phẩm/trang (plan Task 12: size: 12). */
export const PLP_PAGE_SIZE = 12;

/** Giá trị `rating` hợp lệ trên URL (khớp block "Đánh giá": 4★+/3★+). */
const RATING_VALUES: readonly number[] = [4, 3];

export interface PricePreset {
  /** Key trên URL `?price=`. */
  key: string;
  label: Record<'vi' | 'en', string>;
  /** Ràng buộc gửi API — biên rời nhau (giá đúng 500.000 chỉ khớp preset kế). */
  minPrice?: number;
  maxPrice?: number;
}

/** Preset khoảng giá §2.4: Dưới 500k / 500k–1tr / 1–2tr / 2–5tr / Trên 5tr. */
export const PRICE_PRESETS: readonly PricePreset[] = [
  { key: 'under-500k', maxPrice: 500000, label: { vi: 'Dưới 500k', en: 'Under 500k' } },
  { key: '500k-1m', minPrice: 500001, maxPrice: 1000000, label: { vi: '500k – 1tr', en: '500k – 1m' } },
  { key: '1m-2m', minPrice: 1000001, maxPrice: 2000000, label: { vi: '1tr – 2tr', en: '1m – 2m' } },
  { key: '2m-5m', minPrice: 2000001, maxPrice: 5000000, label: { vi: '2tr – 5tr', en: '2m – 5m' } },
  { key: 'over-5m', minPrice: 5000001, label: { vi: 'Trên 5tr', en: 'Over 5m' } },
];

export function pricePreset(key: string): PricePreset | undefined {
  return PRICE_PRESETS.find((preset) => preset.key === key);
}

export interface PlpFilters {
  price?: string;
  /** 3 | 4 — gửi API thành minRating. */
  rating?: number;
  brand?: string;
}

export interface PlpQuery {
  sort: PlpSort;
  page: number;
  filters: PlpFilters;
}

/** Shape searchParams prop của Next 14 (object thuần, không Promise). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/**
 * Parse garbage-tolerant: sort lạ → newest, page ≤ 0/NaN → 1, preset/rating lạ
 * → bỏ filter, brand rỗng → bỏ. Không bao giờ throw.
 */
export function parsePlpSearchParams(searchParams: RawSearchParams): PlpQuery {
  const sortRaw = firstValue(searchParams.sort);
  const sort: PlpSort = PLP_SORTS.includes(sortRaw as PlpSort) ? (sortRaw as PlpSort) : DEFAULT_SORT;

  const pageRaw = Number.parseInt(firstValue(searchParams.page) ?? '', 10);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const priceRaw = firstValue(searchParams.price);
  const price = priceRaw !== undefined && pricePreset(priceRaw) !== undefined ? priceRaw : undefined;

  const ratingRaw = Number.parseInt(firstValue(searchParams.rating) ?? '', 10);
  const rating = RATING_VALUES.includes(ratingRaw) ? ratingRaw : undefined;

  const brandRaw = firstValue(searchParams.brand)?.trim();
  const brand = brandRaw !== undefined && brandRaw.length > 0 ? brandRaw : undefined;

  return {
    sort,
    page,
    filters: {
      price,
      rating,
      brand,
    },
  };
}

/** Filters → query listProducts (preset → minPrice/maxPrice, rating → minRating). */
export function filtersToApiParams(filters: PlpFilters): {
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  brand?: string;
} {
  const preset = filters.price !== undefined ? pricePreset(filters.price) : undefined;
  return {
    minPrice: preset?.minPrice,
    maxPrice: preset?.maxPrice,
    minRating: filters.rating,
    brand: filters.brand,
  };
}

/** Đổi filters → query mới với page reset về 1 (kết quả đổi → về trang đầu). */
export function withFilters(query: PlpQuery, patch: Partial<PlpFilters>): PlpQuery {
  return { ...query, page: 1, filters: { ...query.filters, ...patch } };
}

/**
 * Serialize query → path + `?…` (giữ thứ tự ổn định: price, rating, brand,
 * sort, page). Giá trị mặc định (sort=newest, page=1) và filter rỗng được
 * BỎ → URL sạch, canonical /c/{slug} không query.
 */
export function buildPlpUrl(basePath: string, query: PlpQuery): string {
  const params = new URLSearchParams();
  if (query.filters.price !== undefined) params.set('price', query.filters.price);
  if (query.filters.rating !== undefined) params.set('rating', String(query.filters.rating));
  if (query.filters.brand !== undefined) params.set('brand', query.filters.brand);
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  const qs = params.toString();
  return qs.length > 0 ? `${basePath}?${qs}` : basePath;
}

export type PageItem = number | 'ellipsis';

/**
 * Cửa sổ phân trang ±2 + luôn có trang đầu/cuối, chèn 'ellipsis' khi có khoảng
 * hở (direction §2.4: window ±2 đầu/cuối). totalPages ≤ 7 → liệt kê hết.
 */
export function pageWindow(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const wanted = new Set<number>([1, totalPages, current - 2, current - 1, current, current + 1, current + 2]);
  const pages = [...wanted].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);

  const items: PageItem[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] as number;
    if (index > 0 && page - (pages[index - 1] as number) > 1) items.push('ellipsis');
    items.push(page);
  }
  return items;
}

/**
 * Đi cây danh mục tìm node theo slug (vi HOẶC en — API chấp nhận cả hai trên
 * `?category=`) → chuỗi path [gốc, …, node] cho breadcrumb (đệ quy mọi depth).
 * Không thấy → null. So sánh case-insensitive: slug là URL segment, người dùng
 * có thể gõ hoa.
 */
export function resolveCategoryPath(tree: Category[], slug: string): Category[] | null {
  const target = slug.toLowerCase();

  function walk(node: Category, trail: Category[]): Category[] | null {
    if (node.slug.toLowerCase() === target || node.slugEn.toLowerCase() === target) return [...trail, node];
    for (const child of node.children) {
      const found = walk(child, [...trail, node]);
      if (found) return found;
    }
    return null;
  }

  for (const root of tree) {
    const found = walk(root, []);
    if (found) return found;
  }
  return null;
}
