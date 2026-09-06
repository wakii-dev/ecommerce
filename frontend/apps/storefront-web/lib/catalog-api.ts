import { ApiErrorClient, createCatalogClient, type CatalogClient } from '@ecommerce/contracts';

import type { Locale } from './format';

/** Gateway origin — server components fetch trực tiếp (Conventions #10). */
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

/**
 * Lỗi bọc MỌI failure của catalog call (ApiErrorClient mọi status + network
 * error) — pages bắt lỗi này để render degraded thay vì crash RSC (plan
 * Task 10). `.status` mở raw ApiErrorClient status khi có (vd 404 PDP →
 * Task 13 có thể phân biệt không-found vs unavailable).
 */
export class CatalogUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Catalog unavailable', { cause });
    this.name = 'CatalogUnavailableError';
  }

  get status(): number | undefined {
    return this.cause instanceof ApiErrorClient ? this.cause.status : undefined;
  }
}

/**
 * fetch bọc ISR: gắn `next.revalidate: 60` (SSR/ISR 60s — plan architecture)
 * + `Accept-Language` theo locale của helper. Mọi call ĐI QUA client của
 * @ecommerce/contracts qua fetchImpl injection này.
 */
function cachedFetch(locale: Locale): typeof fetch {
  return (input, init) =>
    globalThis.fetch(input, {
      ...init,
      headers: { ...(init?.headers ?? {}), 'Accept-Language': locale },
      next: { ...(init?.next ?? {}), revalidate: 60 },
    });
}

type ListProductsArgs = Parameters<CatalogClient['listProducts']>[0];
type SearchArgs = Parameters<CatalogClient['searchProducts']>[0];
type ProductCardPage = Awaited<ReturnType<CatalogClient['listProducts']>>;
type ProductDetail = Awaited<ReturnType<CatalogClient['getProduct']>>;
type CategoryTree = Awaited<ReturnType<CatalogClient['getCategories']>>;
type SuggestResponse = Awaited<ReturnType<CatalogClient['suggestProducts']>>;

export type ListProductsParams = Omit<ListProductsArgs, 'locale'>;
export type SearchParams = Omit<SearchArgs, 'locale' | 'q'>;

/** Client catalog đã bake locale — mọi call qua catalogApi(locale). */
export interface CatalogApi {
  listProducts(params?: ListProductsParams): Promise<ProductCardPage>;
  getProduct(slug: string): Promise<ProductDetail>;
  getCategories(): Promise<CategoryTree>;
  search(q: string, params?: SearchParams): Promise<ProductCardPage>;
  suggest(q: string): Promise<SuggestResponse>;
}

async function guard<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof CatalogUnavailableError) throw error;
    throw new CatalogUnavailableError(error);
  }
}

export function catalogApi(locale: Locale): CatalogApi {
  const client = createCatalogClient({ baseURL: GATEWAY_URL, fetchImpl: cachedFetch(locale) });
  return {
    listProducts: (params = {}) => guard(() => client.listProducts({ locale, ...params })),
    getProduct: (slug) => guard(() => client.getProduct({ slug, locale })),
    getCategories: () => guard(() => client.getCategories({ locale })),
    search: (q, params = {}) => guard(() => client.searchProducts({ q, locale, ...params })),
    suggest: (q) => guard(() => client.suggestProducts({ q, locale })),
  };
}

// ── Presentation helpers (plan Task 10 lib bullet) ──────────────────────────

/** Gradient placeholder theo danh mục — map §1.8 (biến CSS định nghĩa ở app.css). */
const GRADIENT_BY_CATEGORY: ReadonlyArray<readonly [RegExp, string]> = [
  [/(dien-tu|electronics)/, 'var(--grad-electronics)'],
  [/(thoi-trang|fashion)/, 'var(--grad-fashion)'],
  [/(nha-cua|home)/, 'var(--grad-home)'],
  [/(sach|books?)/, 'var(--grad-books)'],
  [/(lam-dep|beauty)/, 'var(--grad-beauty)'],
];

export function categoryGradient(slug: string): string {
  const normalized = slug.toLowerCase();
  for (const [pattern, gradient] of GRADIENT_BY_CATEGORY) {
    if (pattern.test(normalized)) return gradient;
  }
  return 'var(--grad-electronics)';
}

/** % giảm giá — chỉ khi comparePrice > price > 0 (guard, làm tròn nguyên). */
export function discountPercent(price: number, comparePrice?: number | null): number | undefined {
  if (!comparePrice || comparePrice <= price || price <= 0) return undefined;
  return Math.round(((comparePrice - price) * 100) / comparePrice);
}
