import Link from 'next/link';

import WishlistHeart from './wishlist/WishlistHeart';

import { categoryGradient, discountPercent, type ProductCard } from '../lib/catalog-api';
import { formatVnd, localePath, type Locale } from '../lib/format';
import { StarRating } from './ui-kit';

/**
 * ProductCardView — anatomy §2.3, DÙNG CHUNG home/PLP/related (Task 11/12).
 * Server component (không 'use client'); cả card là 1 link → PDP
 * (`/p/{slug}` theo locale — API đã resolve slug theo Accept-Language).
 */

/**
 * Gradient placeholder khi không có ảnh — DECISION Task 11: ProductCard KHÔNG
 * mang category slug (chỉ categoryId), nên gradient = hash id → 1 trong 5
 * gradient §1.8 (deterministic per product, thị giác đa dạng). Khi PLP
 * (Task 12) có sidebar danh mục, truyền `gradientKey` = slug danh mục để
 * gradient đúng ngữ nghĩa (dùng categoryGradient()).
 */
const GRADIENT_VARS = [
  'var(--grad-electronics)',
  'var(--grad-fashion)',
  'var(--grad-home)',
  'var(--grad-books)',
  'var(--grad-beauty)',
] as const;

function hashKey(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function productGradient(key: string): string {
  return GRADIENT_VARS[hashKey(key) % GRADIENT_VARS.length] ?? GRADIENT_VARS[0];
}

/**
 * Tag → tint pill §1.6: Chính hãng/Bảo hành = primary · Freeship = success ·
 * Hàng mới = new. Tag ngoài bảng → bỏ (direction chỉ định nghĩa 3 tint).
 */
function tagTint(tag: string): 'primary' | 'success' | 'new' | null {
  if (tag === 'Chính hãng' || tag === 'Bảo hành') return 'primary';
  if (tag === 'Freeship') return 'success';
  if (tag === 'Hàng mới') return 'new';
  return null;
}

/** Tối đa 2 pill/card (direction §2.3 .p-badges). */
export function cardTagPills(tags: readonly string[]): Array<{ tag: string; tint: 'primary' | 'success' | 'new' }> {
  const pills: Array<{ tag: string; tint: 'primary' | 'success' | 'new' }> = [];
  for (const tag of tags) {
    const tint = tagTint(tag);
    if (!tint) continue;
    pills.push({ tag, tint });
    if (pills.length === 2) break;
  }
  return pills;
}

export interface ProductCardViewProps {
  product: ProductCard;
  locale: Locale;
  /** Override gradient (PLP truyền slug danh mục); mặc định hash product.id. */
  gradientKey?: string;
}

export default function ProductCardView({ product, locale, gradientKey }: ProductCardViewProps) {
  const href = localePath(`/p/${product.slug}`, locale);
  const percent = product.discountPercent ?? discountPercent(product.price, product.comparePrice);
  const gradient = gradientKey ? categoryGradient(gradientKey) : productGradient(product.id);
  const pills = cardTagPills(product.tags);

  return (
    <Link className="p-card" href={href}>
      <span className="p-thumb" style={{ background: gradient }}>
        {/* SF-8: wishlist heart overlay — client island, click không điều hướng */}
        <WishlistHeart productId={product.id} locale={locale} variant="card" />
        {product.image.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- placeholder seed /media/**, <Image> khi ảnh thật (SF-4 protocol)
          <img src={product.image.url} alt={product.image.alt ?? product.name} loading="lazy" />
        ) : null}
        {percent !== undefined ? <span className="badge-off">-{percent}%</span> : null}
        {pills.length > 0 ? (
          <span className="p-badges">
            {pills.map((pill) => (
              <span key={pill.tag} className={`p-pill p-pill--${pill.tint}`}>
                {pill.tag}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="p-body">
        <span className="p-name">{product.name}</span>
        <span className="p-price-row">
          <span className="p-price">{formatVnd(product.price)}</span>
          {product.comparePrice !== undefined && product.comparePrice > product.price ? (
            <s className="p-price-compare">{formatVnd(product.comparePrice)}</s>
          ) : null}
        </span>
        <span className="p-meta">
          <StarRating value={product.ratingAvg} size="sm" ariaLabel={`${product.name}: ${product.ratingAvg}/5`} />
          <span className="p-rating-count">({product.ratingCount})</span>
        </span>
      </span>
    </Link>
  );
}
