'use client';

import { useCallback, useState } from 'react';

import AddToCart from './AddToCart';
import StockAlertInput from './StockAlertInput';
import VariantSelector from './VariantSelector';
import { discountPercent, type ProductDetail } from '../../lib/catalog-api';
import { formatVnd, type Locale } from '../../lib/format';
import { priceWithDelta } from '../../lib/pdp';

/**
 * Buy-box PDP (plan Task 13): vùng INFO tương tác — price-block Giá HIỂN THỊ
 * ĐỘNG theo variant (price + priceDelta), VariantSelector, AddToCart. Client
 * component NHƯNG vẫn SSR đầy đủ ra HTML (Next render client component lần
 * đầu trên server) — giá/CTA có mặt trong view-source.
 */

const COPY = {
  vi: { color: 'Màu', size: 'Size', note: 'Giá tốt mỗi ngày — hàng chính hãng 100%' },
  en: { color: 'Color', size: 'Size', note: 'Great price every day — 100% authentic' },
} as const;

export default function PdpBuyBox({ product, locale }: { product: ProductDetail; locale: Locale }) {
  const copy = COPY[locale];
  const [variantId, setVariantId] = useState<string | null>(null);

  // ID báo lên từ VariantSelector → tra ngược variant (match lại từ selection
  // gốc của selector, ở đây chỉ cần delta giá).
  const selected = product.variants.find((variant) => variant.id === variantId) ?? null;
  const price = priceWithDelta(product.price, selected?.priceDelta);
  const percent = product.discountPercent ?? discountPercent(price, product.comparePrice);

  const onChange = useCallback((id: string | null) => setVariantId(id), []);

  return (
    <div className="pdp-buybox">
      <div className="pdp-price-block">
        <span className="pdp-price">{formatVnd(price)}</span>
        {product.comparePrice !== undefined && product.comparePrice > price ? (
          <s className="pdp-price-compare">{formatVnd(product.comparePrice)}</s>
        ) : null}
        {percent !== undefined ? <span className="pdp-price-pill">-{percent}%</span> : null}
        <span className="pdp-price-note">{copy.note}</span>
      </div>

      <VariantSelector
        variants={product.variants}
        colorLabel={copy.color}
        sizeLabel={copy.size}
        onChange={onChange}
      />

      {/* SF-6: slug hint cho cart enrichment (catalog không có id-lookup —
          REQUIREMENT-GAP FI-310) — product.slug đã có sẵn trong PDP data. */}
      <AddToCart
        productId={product.id}
        variantId={variantId}
        slug={product.slug}
        locale={locale}
      />

      {/* SF-15: hết hàng → form "Nhắn tôi khi có hàng" (ẩn khi còn/unknown). */}
      <StockAlertInput variantId={variantId} slug={product.slug} locale={locale} />
    </div>
  );
}
