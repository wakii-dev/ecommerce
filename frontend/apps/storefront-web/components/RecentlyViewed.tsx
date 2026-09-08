'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Price } from '@ecommerce/ui-kit';
import Link from 'next/link';
import { categoryGradient } from '../lib/catalog-api';
import type { Locale } from '../lib/format';
import { t } from '../lib/i18n';
import { readRecentlyViewed, type RecentlyViewedItem } from '../lib/recently-viewed';

/**
 * Section "Đã xem gần đây" ở home (SF-13 A6a) — client island đọc
 * localStorage (PDP ghi qua RecentlyViewedTracker); ẩn khi trống.
 * FI-392 T11: card dùng anatomy `.p-card` như ProductCardView (thumb
 * gradient qua categoryGradient(slug) → token `--grad-cat-*`, Price
 * primitive); 0 inline-style, 0 hex. T12: copy trong lib/i18n (miền `home`).
 */
export default function RecentlyViewed({ locale }: { locale: Locale }): ReactElement | null {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setItems(readRecentlyViewed());
    setMounted(true);
  }, []);

  // SSR + lần render đầu client trống → null (tránh hydration mismatch)
  if (!mounted || items.length === 0) return null;

  const title = t(locale, 'home.recentlyViewed');

  return (
    <section className="featured" aria-label={title} data-testid="recently-viewed">
      <div className="featured-head">
        <div className="featured-head-left">
          <span className="section-bar" aria-hidden="true" />
          <h3 className="section-title">{title}</h3>
        </div>
      </div>
      <div className="featured-grid">
        {items.map((item) => (
          <Link
            key={item.slug}
            href={locale === 'en' ? `/en/p/${item.slugEn || item.slug}` : `/p/${item.slug}`}
            className="p-card"
          >
            <span className="p-thumb" style={{ background: categoryGradient(item.slug) }}>
              {item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : null}
            </span>
            <span className="p-body">
              <span className="p-name">{item.name}</span>
              <span className="p-price-row">
                {/* locale 'vi-VN' cố định — khớp ProductCardView (i18n T12 xem lại) */}
                <Price
                  value={item.price}
                  comparePrice={item.comparePrice ?? undefined}
                  locale="vi-VN"
                  className="p-price"
                />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
