import type { MetadataRoute } from 'next';

import { siteUrl } from '../lib/site';

/**
 * robots.txt (plan Task 14): allow all, chặn route app-private (cart/checkout/
 * account/admin/api), sitemap absolute từ SITE_URL (default localhost:3000).
 *
 * force-dynamic: metadata route KHÔNG set sẽ bị prerender LÚC BUILD — khi đó
 * SITE_URL chưa có trong build stage (Dockerfile) → sitemap baked :3000 sai
 * origin. Render per-request ăn SITE_URL runtime của deployment (https :8443).
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/cart', '/checkout', '/account', '/admin', '/api'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
