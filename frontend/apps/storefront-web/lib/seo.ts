import type { Locale } from './format';
import { siteUrl } from './site';

/**
 * SEO helpers (plan Task 10). pdpMetadata wire sẵn signature cuối — full impl
 * (OG/JSON-LD) ở Task 13, phần quyết định title/description/robots test được
 * unit ngay từ task này (pure helpers, không đụng React).
 */

/** Field SEO-relevant của ProductDetail/ProductCard (chỉ phần seo dùng). */
export interface SeoProduct {
  name: string;
  /** Slug THEO locale đang xem (vi path). */
  slug: string;
  /** Slug tiếng Anh cho hreflang en — vắng → dùng slug. */
  slugEn?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface Alternates {
  languages: { vi: string; en: string };
}

/** hreflang cặp vi/en tuyệt đối từ SITE_URL (plan: absolute URLs từ env). */
export function buildAlternates(basePath: string, enPath?: string): Alternates {
  const base = siteUrl();
  return {
    languages: {
      vi: `${base}${basePath}`,
      en: `${base}${enPath ?? `/en${basePath}`}`,
    },
  };
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** seoTitle ưu tiên (đã resolve ở backend) — rỗng/blank → fallback. */
export function resolveTitle(seoTitle: string | undefined, fallback: string): string {
  return hasText(seoTitle) ? seoTitle.trim() : fallback;
}

/** seoDescription ưu tiên — rỗng/blank → fallback (description/name). */
export function resolveDescription(seoDescription: string | undefined, fallback: string): string {
  return hasText(seoDescription) ? seoDescription.trim() : fallback;
}

export interface PdpMetadataResult {
  title: string;
  description: string;
  alternates: Alternates;
  robots: { index: boolean; follow: boolean };
}

/** Copy home theo locale — title.default + description bilingual (Task 11). */
const HOME_COPY: Record<Locale, { title: string; description: string }> = {
  vi: {
    title: 'Shop VN — Chợ sôi động',
    description: 'Chợ sôi động — hàng nghìn sản phẩm chính hãng, giá tốt mỗi ngày.',
  },
  en: {
    title: 'Shop VN — Vibrant marketplace',
    description: 'Shop VN — thousands of official products at great prices, every day.',
  },
};

export interface HomeMetadataResult {
  /** absolute — home KHÔNG áp template `%s | Shop VN` của layout. */
  title: { absolute: string };
  description: string;
  alternates: Alternates;
}

/**
 * Metadata trang chủ — overrides title/description của layout theo
 * locale (layout dùng chung 1 chuỗi vi cho cả hai); metadataBase kế thừa,
 * alternates = cặp vi/en gốc.
 */
export function homeMetadata(locale: Locale): HomeMetadataResult {
  const copy = HOME_COPY[locale];
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: buildAlternates('/'),
  };
}


/**
 * Metadata PDP: seoTitle/seoDescription priority, fallback name/description.
 * robots.index = false khi locale `en` VÀ có fallback (thiếu bản dịch SEO —
 * trang en nội dung vi không nên index).
 */
// ── Sitemap entry builders (Task 14 — pure, unit-test được) ─────────────────

/** Card tối thiểu cần cho sitemap (subset ProductCard — slug/slugEn luôn có). */
export interface SitemapProduct {
  slug: string;
  slugEn: string;
}

export interface SitemapEntry {
  url: string;
  changeFrequency: 'daily' | 'weekly';
  alternates: { languages: { vi: string; en: string } };
}

/**
 * Entries sản phẩm: vi = `/p/{slug}` (slug đã resolve vi), en = `/en/p/{slugEn}`
 * — mỗi entry mang alternates.languages cặp hreflang (plan Task 14: 1 loop vi
 * là đủ nhờ slugEn luôn trả trên card).
 */
export function buildProductSitemapEntries(products: readonly SitemapProduct[], base: string): SitemapEntry[] {
  return products.map((product) => ({
    url: `${base}/p/${product.slug}`,
    changeFrequency: 'weekly',
    alternates: {
      languages: {
        vi: `${base}/p/${product.slug}`,
        en: `${base}/en/p/${product.slugEn}`,
      },
    },
  }));
}

/** Route tĩnh (vi bare + en prefix) — emit CẢ HAI url, mỗi url đủ alternates. */
const STATIC_ROUTES: ReadonlyArray<readonly [viPath: string, enPath: string]> = [
  ['/', '/en/'],
  ['/search', '/en/search'],
  ['/coupons', '/en/coupons'],
];

export function buildStaticSitemapEntries(base: string): SitemapEntry[] {
  return STATIC_ROUTES.flatMap(([viPath, enPath]) => {
    const languages = { vi: `${base}${viPath}`, en: `${base}${enPath}` };
    return [
      { url: `${base}${viPath}`, changeFrequency: 'daily', alternates: { languages } },
      { url: `${base}${enPath}`, changeFrequency: 'daily', alternates: { languages } },
    ];
  });
}

/**
 * Metadata PDP: seoTitle/seoDescription priority, fallback name/description.
 * robots.index = false khi locale `en` VÀ có fallback (thiếu bản dịch SEO —
 * trang en nội dung vi không nên index).
 */
export function pdpMetadata(product: SeoProduct, locale: Locale): PdpMetadataResult {
  const hasSeoTitle = hasText(product.seoTitle);
  const hasSeoDescription = hasText(product.seoDescription);
  const descriptionFallback = hasText(product.description) ? product.description.trim() : product.name;
  const usedFallback = !hasSeoTitle || !hasSeoDescription;
  return {
    title: resolveTitle(product.seoTitle, product.name),
    description: resolveDescription(product.seoDescription, descriptionFallback),
    // enPath PHẢI mang prefix /en (Task 13 fix: buildAlternates KHÔNG tự thêm
    // prefix khi enPath được truyền tường minh — trước đây ra /p/{slugEn} mất /en).
    alternates: buildAlternates(`/p/${product.slug}`, `/en/p/${product.slugEn ?? product.slug}`),
    robots: {
      index: !(locale === 'en' && usedFallback),
      follow: true,
    },
  };
}
