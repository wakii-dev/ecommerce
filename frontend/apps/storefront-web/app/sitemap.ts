import type { MetadataRoute } from 'next';

import { catalogApi } from '../lib/catalog-api';
import { siteUrl } from '../lib/site';
import { buildProductSitemapEntries, buildStaticSitemapEntries, type SitemapProduct } from '../lib/seo';

/**
 * Sitemap (plan Task 14): static routes (/, /search, /coupons — vi bare + en
 * prefix, alternates.languages) + TẤT CẢ sản phẩm published (loop size=100
 * locale vi — 1 loop đủ nhờ card luôn mang slugEn cho URL en qua alternates).
 * Catalog down/lỗi BẤT KỲ → trả static-only, KHÔNG crash build. force-dynamic:
 * route KHÔNG set sẽ bị prerender LÚC BUILD — SITE_URL vắng trong build stage
 * (Dockerfile) → mọi <loc> baked :3000 sai origin; render per-request ăn
 * SITE_URL runtime của deployment (https :8443). Route rẻ (2 fetch, < 50 URL).
 */

export const dynamic = 'force-dynamic';

/** Chặn vòng lặp phòng hờ khi `total` lệch thực tế. */
const MAX_PAGES = 50;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticEntries = buildStaticSitemapEntries(base);

  try {
    const api = catalogApi('vi');
    const products: SitemapProduct[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await api.listProducts({ page, size: 100 });
      products.push(...result.items);
      if (products.length >= result.total || result.items.length === 0) break;
    }
    return [...staticEntries, ...buildProductSitemapEntries(products, base)];
  } catch {
    return staticEntries;
  }
}
