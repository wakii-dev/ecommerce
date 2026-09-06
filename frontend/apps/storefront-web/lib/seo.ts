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
    alternates: buildAlternates(`/p/${product.slug}`, `/p/${product.slugEn ?? product.slug}`),
    robots: {
      index: !(locale === 'en' && usedFallback),
      follow: true,
    },
  };
}
