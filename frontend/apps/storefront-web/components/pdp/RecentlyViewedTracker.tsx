'use client';

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { trackRecentlyViewed } from '../../lib/recently-viewed';

/**
 * Ghi localStorage `recently_viewed` khi user mở PDP (SF-13 A6a) —
 * client island, snapshot đủ cho card mini ở home (không fetch lại).
 */
export default function RecentlyViewedTracker({
  slug,
  slugEn,
  name,
  price,
  comparePrice,
  discountPercent,
  image
}: {
  slug: string;
  slugEn: string;
  name: string;
  price: number;
  comparePrice: number | null | undefined;
  discountPercent: number | null | undefined;
  image: string;
}): ReactElement {
  useEffect(() => {
    trackRecentlyViewed({ slug, slugEn, name, price, comparePrice, discountPercent, image });
  }, [slug, slugEn, name, price, comparePrice, discountPercent, image]);
  return <></>;
}
