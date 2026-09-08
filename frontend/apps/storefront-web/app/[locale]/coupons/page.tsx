import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import CopyButton from '../../../components/coupons/CopyButton';
import { couponValueLabel, type PublicCoupon } from '../../../lib/coupon';
import { formatVnd, localePath, resolveLocale, type Locale } from '../../../lib/format';
import { buildAlternates } from '../../../lib/seo';

/**
 * Coupon center (plan Task 14) — fetch GET /api/ordering/coupons/public qua
 * gateway (server component fetch trực tiếp GATEWAY_URL, ISR 60s). Route
 * ordering chưa tồn tại (SF-9) / gateway down / non-200 → mock-gate empty
 * state "Chưa có mã giảm giá nào — quay lại sau nhé" (đúng pack Q10), không
 * bao giờ crash RSC.
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

const COPY: Record<
  Locale,
  { title: string; empty: string; emptyDesc: string; minOrder: string; expires: string; expired: string }
> = {
  vi: {
    title: 'Mã giảm giá',
    empty: 'Chưa có mã giảm giá nào — quay lại sau nhé',
    emptyDesc: 'Ưu đãi mới sẽ xuất hiện tại đây khi có chương trình khuyến mãi.',
    minOrder: 'Đơn tối thiểu',
    expires: 'HSD',
    expired: 'Hết hạn',
  },
  en: {
    title: 'Coupons',
    empty: 'No coupons available — check back soon',
    emptyDesc: 'New deals will appear here when a promotion starts.',
    minOrder: 'Min. order',
    expires: 'Exp.',
    expired: 'Expired',
  },
};

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  return {
    title: COPY[locale].title,
    alternates: {
      canonical: localePath('/coupons', locale),
      languages: buildAlternates('/coupons', '/en/coupons').languages,
    },
  };
}

function expiryLabel(endsAt: string, locale: Locale): string | null {
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${locale === 'en' ? 'Exp.' : 'HSD'} ${date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN')}`;
}

/** Pill "Hết hạn" chỉ khi endsAt parse được VÀ đã qua (direction §4 tint-new — không bịa khi thiếu/invalid). */
function isExpired(endsAt: string): boolean {
  const date = new Date(endsAt);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export default async function CouponsPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  const t = COPY[locale];

  let coupons: PublicCoupon[] | null = null;
  try {
    const response = await fetch(`${GATEWAY_URL}/api/ordering/coupons/public`, { next: { revalidate: 60 } });
    if (response.ok) {
      const json: unknown = await response.json();
      coupons = Array.isArray(json) ? (json as PublicCoupon[]) : [];
    }
  } catch {
    // gateway down / route chưa có (SF-9) — giữ null → empty state.
  }

  return (
    <div className="container coupons">
      <div className="plp-head">
        <h1 className="plp-title">{t.title}</h1>
      </div>

      {coupons === null || coupons.length === 0 ? (
        <div className="coupons-empty">
          <span className="coupons-empty-icon" aria-hidden="true">
            🎟️
          </span>
          <p className="coupons-empty-title">{t.empty}</p>
          <p className="coupons-empty-desc">{t.emptyDesc}</p>
        </div>
      ) : (
        <div className="coupons-grid">
          {coupons.map((coupon) => {
            const expiry = coupon.endsAt !== undefined ? expiryLabel(coupon.endsAt, locale) : null;
            const expired = coupon.endsAt !== undefined && isExpired(coupon.endsAt);
            return (
              <article key={coupon.code} className="coupon-card">
                <span className="coupon-code">{coupon.code}</span>
                <p className="coupon-desc">{coupon.description}</p>
                <span className="coupon-value">{couponValueLabel(coupon.type, coupon.value, locale)}</span>
                {coupon.minOrderValue !== undefined ? (
                  <span className="coupon-meta">
                    {t.minOrder} {formatVnd(coupon.minOrderValue)}
                  </span>
                ) : null}
                {expiry !== null ? <span className="coupon-meta">{expiry}</span> : null}
                {expired ? <span className="coupon-expired">{t.expired}</span> : null}
                <CopyButton code={coupon.code} locale={locale} />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
