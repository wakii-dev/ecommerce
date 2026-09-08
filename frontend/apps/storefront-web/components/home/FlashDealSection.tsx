import Link from 'next/link';

import { discountPercent, type ProductCard } from '../../lib/catalog-api';
import { formatVnd, localePath, type Locale } from '../../lib/format';
import { earliestFlashEndsAt } from '../../lib/home-composition';
import { productGradient } from '../ProductCardView';

import Countdown from './Countdown';

/**
 * Flash deal section (direction §2.2.2) — khối `var(--grad-flash)`
 * (#FFD839→#FFB800 §1.8) --radius-lg padding 16 --shadow-2; h3 24px/800
 * uppercase --c-on-accent + icon sét inline SVG --c-primary (Icon catalog
 * không có zap — precedent Header) + Countdown (mốc endsAt sớm nhất của
 * rail) + pill "Xem tất cả" nền trắng .4 hover .65; hàng ngang scroll-x
 * card 186px: thumb 150px gradient/badge -% nền primary, tên clamp 2 dòng
 * cao 37, giá --c-danger 16px/800 + giá gạch 12px. Rail rỗng → không
 * render gì.
 *
 * Honesty: progress bar "Đã bán N/M" (§2.2.2) KHÔNG render — ProductCard
 * DTO không có field sold/stock (catalogSchema ProductCard: id, slug, name,
 * price, comparePrice, discountPercent, flashSaleEndsAt, ratingAvg,
 * ratingCount, image, tags, categoryId) → không bịa số.
 *
 * "Xem tất cả" trỏ /c/dien-tu?sort=discount (convention mini-nav): slug PLP
 * cần category slug, ProductCard chỉ có categoryId (uuid, không phải slug).
 */

export default function FlashDealSection({ items, locale }: { items: ProductCard[]; locale: Locale }) {
  if (items.length === 0) return null;

  const endsAt = earliestFlashEndsAt(items);

  return (
    <section className="flash" aria-label="Flash sale">
      <div className="flash-head">
        <h3 className="flash-title">
          <svg
            className="flash-bolt"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Flash Sale
        </h3>
        {endsAt ? <Countdown endsAt={endsAt} /> : null}
        <Link
          className="flash-more"
          href={localePath('/c/dien-tu?sort=discount', locale)}
          prefetch={false}
        >
          {locale === 'en' ? 'See all' : 'Xem tất cả'}
        </Link>
      </div>
      <div className="flash-row">
        {items.map((product) => {
          const percent = product.discountPercent ?? discountPercent(product.price, product.comparePrice);
          return (
            <Link key={product.id} className="flash-card" href={localePath(`/p/${product.slug}`, locale)}>
              <span className="flash-thumb" style={{ background: productGradient(product.id) }}>
                {product.image.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- placeholder seed /media/**, <Image> khi ảnh thật
                  <img src={product.image.url} alt={product.image.alt ?? product.name} loading="lazy" />
                ) : null}
                {percent !== undefined ? <span className="badge-off">-{percent}%</span> : null}
              </span>
              <span className="flash-name">{product.name}</span>
              <span className="flash-price-row">
                <span className="flash-price">{formatVnd(product.price)}</span>
                {product.comparePrice !== undefined && product.comparePrice > product.price ? (
                  <s className="flash-price-compare">{formatVnd(product.comparePrice)}</s>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
