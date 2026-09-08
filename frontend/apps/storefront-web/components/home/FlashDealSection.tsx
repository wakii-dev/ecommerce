import Link from 'next/link';

import { discountPercent, type ProductCard } from '../../lib/catalog-api';
import { formatVnd, localePath, type Locale } from '../../lib/format';
import { earliestFlashEndsAt } from '../../lib/home-composition';
import { productGradient } from '../ProductCardView';

import Countdown from './Countdown';

/**
 * Flash deal section (direction §2.2.2) — nền gradient vàng
 * `var(--grad-flash)` (#FFD839→#FFB800 §1.8), h2 24px/800 uppercase +
 * Countdown (mốc endsAt sớm nhất của rail); hàng ngang scroll-x card 186px:
 * thumb 150px gradient/badge -% nền primary, tên clamp 2 dòng, giá
 * --c-danger 16px/800 + giá gạch 12px. Rail rỗng → không render gì.
 */

export default function FlashDealSection({ items, locale }: { items: ProductCard[]; locale: Locale }) {
  if (items.length === 0) return null;

  const endsAt = earliestFlashEndsAt(items);

  return (
    <section className="flash" aria-label="Flash sale">
      <div className="flash-head">
        <h2 className="flash-title">Flash Sale</h2>
        {endsAt ? <Countdown endsAt={endsAt} /> : null}
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
