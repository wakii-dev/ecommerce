/**
 * Price — hiển thị giá VND theo locale (mặc định vi-VN), kèm giá gạch
 * strikethrough + badge phần trăm giảm giá.
 *
 * Formatter cache theo locale: `new Intl.NumberFormat` KHÔNG chạy ở module
 * top-level (D16 framework-portable — node/edge/SSR an toàn).
 */

const formatters = new Map<string, Intl.NumberFormat>();

export function formatPrice(value: number, locale = 'vi-VN'): string {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'VND'
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(value);
}

export interface PriceProps {
  /** Giá bán (VND) */
  value: number;
  /** Giá gốc trước giảm — hiện strikethrough + badge -N% nếu lớn hơn value */
  comparePrice?: number;
  size?: 'sm' | 'md' | 'lg';
  locale?: string;
  className?: string;
}

export function Price({
  value,
  comparePrice,
  size = 'md',
  locale = 'vi-VN',
  className
}: PriceProps) {
  const hasDiscount =
    comparePrice !== undefined && comparePrice > value && value > 0;
  const discountPercent = hasDiscount
    ? Math.round((1 - value / comparePrice) * 100)
    : undefined;

  const cls = [
    'uk-price',
    `uk-price--${size}`,
    className ?? null
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls}>
      <span className="uk-price__value">{formatPrice(value, locale)}</span>
      {hasDiscount ? (
        <s className="uk-price__compare">{formatPrice(comparePrice, locale)}</s>
      ) : null}
      {discountPercent !== undefined ? (
        <span className="uk-badge uk-badge--danger uk-price__discount">
          -{discountPercent}%
        </span>
      ) : null}
    </span>
  );
}
