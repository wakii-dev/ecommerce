'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { formatPrice } from '@ecommerce/ui-kit';
import Link from 'next/link';
import { readRecentlyViewed, type RecentlyViewedItem } from '../lib/recently-viewed';

const COPY = {
  vi: { title: 'Đã xem gần đây' },
  en: { title: 'Recently viewed' }
} as const;

const GRADIENTS = [
  'linear-gradient(135deg,#ffe9e4,#ffd8cf)',
  'linear-gradient(135deg,#e4f2ff,#cfe6ff)',
  'linear-gradient(135deg,#fff5d6,#ffe9ad)',
  'linear-gradient(135deg,#e9f9ef,#cdefdc)',
  'linear-gradient(135deg,#f3e9ff,#e0ccff)'
];

/**
 * Section "Đã xem gần đây" ở home (SF-13 A6a) — client island đọc
 * localStorage (PDP ghi qua RecentlyViewedTracker); ẩn khi trống.
 */
export default function RecentlyViewed({ locale }: { locale: string }): ReactElement | null {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setItems(readRecentlyViewed());
    setMounted(true);
  }, []);

  // SSR + lần render đầu client trống → null (tránh hydration mismatch)
  if (!mounted || items.length === 0) return null;

  const copy = COPY[locale === 'en' ? 'en' : 'vi'];
  const gradientFor = (index: number) => GRADIENTS[index % GRADIENTS.length];

  return (
    <section className="featured" aria-label={copy.title} data-testid="recently-viewed">
      <div className="featured-head">
        <div className="featured-head-left">
          <h2 style={{ margin: 0, fontSize: 20 }}>{copy.title}</h2>
        </div>
      </div>
      <div className="featured-grid">
        {items.map((item, index) => (
          <Link
            key={item.slug}
            href={locale === 'en' ? `/en/p/${item.slugEn || item.slug}` : `/p/${item.slug}`}
            className="rv-card"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <span className="p-thumb" style={{ background: gradientFor(index) }}>
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : null}
            </span>
            <span
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                fontSize: 13,
                minHeight: 36
              }}
            >
              {item.name}
            </span>
            <span style={{ fontWeight: 600, color: '#F53D2D', fontSize: 14 }}>{formatPrice(item.price)}</span>
            {item.comparePrice != null && item.comparePrice > item.price ? (
              <span style={{ textDecoration: 'line-through', color: '#999', fontSize: 12 }}>
                {formatPrice(item.comparePrice)}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
