import type { MetadataRoute } from 'next';

import { siteUrl } from '../lib/site';

/**
 * robots.txt (plan Task 14): allow all, chặn route app-private (cart/checkout/
 * account/admin/api), sitemap absolute từ SITE_URL (default localhost:3000).
 */
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
