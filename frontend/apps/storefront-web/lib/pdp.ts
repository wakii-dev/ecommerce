/**
 * PDP pure helpers (plan Task 13) — JSON-LD build, variant match, category
 * path theo ID. Tách khỏi page/component để unit test được (node env, không
 * render React — cùng pattern lib/plp-params).
 */

import type { Category, ProductDetail } from './catalog-api';
import { localePath, type Locale } from './format';

/** Chọn variant khớp selection {color, size} — null/undefined = "không ràng buộc". */
export type VariantSelection = { color?: string | null; size?: string | null };
export type PdpVariant = ProductDetail['variants'][number];

/**
 * Variant đầu tiên khớp: mọi key ĐÃ CHỌN (khác null/undefined/'') phải trùng
 * variant.options[key]; key chưa chọn khớp bất kỳ. Không có → null (combo lẻ).
 */
export function pickVariant(variants: readonly PdpVariant[], selection: VariantSelection): PdpVariant | null {
  for (const variant of variants) {
    const matches = (Object.keys(selection) as Array<keyof VariantSelection>).every((key) => {
      const wanted = selection[key];
      if (wanted === null || wanted === undefined || wanted === '') return true;
      return variant.options[key] === wanted;
    });
    if (matches) return variant;
  }
  return null;
}

/** Giá hiển thị = giá gốc + priceDelta của variant (vắng delta → nguyên giá). */
export function priceWithDelta(basePrice: number, priceDelta: number | undefined): number {
  return basePrice + (priceDelta ?? 0);
}

/** Giá trị phân biệt theo dimension (vd 'color') — giữ thứ tự xuất hiện. */
export function collectOptions(variants: readonly PdpVariant[], key: string): string[] {
  const seen = new Set<string>();
  for (const variant of variants) {
    const value = variant.options[key];
    if (typeof value === 'string' && value.length > 0) seen.add(value);
  }
  return [...seen];
}

/** Path gốc→node theo ID (PDP breadcrumb — product chỉ mang categoryId). */
export function categoryPathById(tree: readonly Category[], id: string): Category[] | null {
  function walk(nodes: readonly Category[], ancestors: readonly Category[]): Category[] | null {
    for (const node of nodes) {
      const path = [...ancestors, node];
      if (node.id === id) return path;
      if (node.children.length > 0) {
        const found = walk(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(tree, []);
}

/** Chỉ nhận chuỗi khác rỗng (ảnh/brand rỗng → bỏ khỏi JSON-LD/metadata). */
function hasText(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface JsonLdInput {
  name: string;
  slug: string;
  description?: string;
  brand?: string;
  /** Slug tiếng Anh — chỉ dùng khi locale=en (sku luôn là slug vi). */
  slugEn?: string;
  image?: { url?: string; alt?: string } | null;
  price: number;
  ratingAvg: number;
  ratingCount: number;
}

/**
 * Product JSON-LD (schema.org) — build object THUẦN, page JSON.stringify toàn
 * khối (an toàn injection: stringify escape đúng mọi chuỗi từ API).
 * - image: CHỈ khi url khác rỗng (không bao giờ nhét chuỗi rỗng).
 * - aggregateRating: CHỈ khi ratingCount > 0.
 * - offers.url: absolute SITE_URL + localePath('/p/'+slug) (en → /en/p/...).
 * - sku: slug vi (product.slug là slug theo locale — slugEn fallback khi en).
 */
export function jsonLdFor(product: JsonLdInput, locale: Locale, origin: string): Record<string, unknown> {
  const skuSlug = locale === 'en' ? (product.slugEn ?? product.slug) : product.slug;
  const offers: Record<string, unknown> = {
    '@type': 'Offer',
    price: String(product.price),
    priceCurrency: 'VND',
    availability: 'https://schema.org/InStock',
    url: `${origin}${localePath(`/p/${product.slug}`, locale)}`,
  };
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: hasText(product.description) ? product.description : undefined,
    brand: hasText(product.brand) ? { '@type': 'Brand', name: product.brand } : undefined,
    sku: skuSlug,
    offers,
  };
  if (product.image && hasText(product.image.url)) {
    jsonLd.image = product.image.url;
  }
  if (product.ratingCount > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.ratingAvg,
      reviewCount: product.ratingCount,
    };
  }
  return jsonLd;
}

/** 1 bậc breadcrumb — path ĐÃ qua localePath theo locale của trang. */
export interface BreadcrumbItem {
  name: string;
  path: string;
}

/**
 * BreadcrumbList JSON-LD (schema.org, T14) — trả CHUỖI JSON đã escape `<` →
 * `<` để page nhúng thẳng vào script tag: tên danh mục là admin-enter
 * nên `</script>` trong name không được đóng sớm thẻ script (stored XSS —
 * cùng pattern Product JSON-LD ở page.tsx, security-P2 FI-391). JSON vẫn
 * parse đúng sau revert (`<` là escape chuẩn của JSON.stringify).
 * Item cuối = trang hiện tại; position 1..n; item = URL absolute origin+path.
 */
export function breadcrumbJsonld(items: readonly BreadcrumbItem[], origin: string): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  };
  return JSON.stringify(jsonLd).replace(/</g, '\\u003c');
}
