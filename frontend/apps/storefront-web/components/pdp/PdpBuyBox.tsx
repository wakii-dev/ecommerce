'use client';

import { useCallback, useState } from 'react';

import AddToCart from './AddToCart';
import StockAlertInput from './StockAlertInput';
import VariantSelector from './VariantSelector';
import { discountPercent, type ProductDetail } from '../../lib/catalog-api';
import { formatVnd, type Locale } from '../../lib/format';
import { t } from '../../lib/i18n';
import { priceWithDelta } from '../../lib/pdp';

/**
 * Buy-box PDP (plan Task 13): vùng INFO tương tác — price-block Giá HIỂN THỊ
 * ĐỘNG theo variant (price + priceDelta), VariantSelector, AddToCart. Client
 * component NHƯNG vẫn SSR đầy đủ ra HTML (Next render client component lần
 * đầu trên server) — giá/CTA có mặt trong view-source. T12: copy trong
 * lib/i18n (miền `pdp.buy*`).
 */

export default function PdpBuyBox({ product, locale }: { product: ProductDetail; locale: Locale }) {
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
        <span className="pdp-price-note">{t(locale, 'pdp.buyNote')}</span>
      </div>

      <VariantSelector
        variants={product.variants}
        colorLabel={t(locale, 'pdp.buyColor')}
        sizeLabel={t(locale, 'pdp.buySize')}
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
