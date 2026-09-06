import Link from 'next/link';

import { StarRating } from '../../components/ui-kit';
import { localePath, type Locale } from '../../lib/format';
import { breakdownPercentages, listProductReviews, ReviewsUnavailableError, type ReviewList } from '../../lib/reviews-api';
import ReviewBadge from './ReviewBadge';
import MyPendingReviewPanel from './MyPendingReviewPanel';
import WriteReviewControl from './WriteReviewControl';

/**
 * PDP reviews section (SF-8, spec Q14 — server component): tổng điểm + sao +
 * breakdown bars + list review APPROVED (badge "Mua đã xác nhận" khi
 * verifiedPurchase) + pagination links `?reviewPage=N`. Fetch NO-STORE —
 * moderation thấy ngay (khác ISR 60s product, Q14). Client islands: nút viết
 * review (modal) + my-pending manage. Lỗi fetch → degraded, không crash PDP.
 */

const COPY = {
  vi: {
    heading: 'Đánh giá sản phẩm',
    reviewsUnit: 'đánh giá',
    empty: 'Chưa có đánh giá nào — hãy là người đầu tiên!',
    degraded: 'Không tải được đánh giá lúc này — thử lại sau ít phút.',
    verified: 'Mua đã xác nhận',
    prev: 'Trang trước',
    next: 'Trang sau',
  },
  en: {
    heading: 'Product reviews',
    reviewsUnit: 'reviews',
    empty: 'No reviews yet — be the first!',
    degraded: 'Could not load reviews right now — try again later.',
    verified: 'Verified purchase',
    prev: 'Previous',
    next: 'Next',
  },
} as const;

export const REVIEWS_PAGE_SIZE = 5;

export default async function ProductReviewsSection({
  slug,
  productId,
  locale,
  reviewPage,
}: {
  slug: string;
  productId: string;
  locale: Locale;
  reviewPage: number;
}): Promise<React.ReactElement> {
  const copy = COPY[locale];

  let list: ReviewList | null;
  try {
    list = await listProductReviews(slug, reviewPage, locale);
  } catch (error) {
    if (!(error instanceof ReviewsUnavailableError)) throw error;
    return (
      <div className="rv-section">
        <h2 className="rv-heading">{copy.heading}</h2>
        <p className="rv-empty">{copy.degraded}</p>
      </div>
    );
  }

  const breakdown = breakdownPercentages(
    Object.fromEntries(Object.entries(list.breakdown ?? {}).map(([k, v]) => [k, Number(v)])),
  );
  const total = Number(list.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));
  const average = averageOf(list);

  return (
    <div className="rv-section">
      <h2 className="rv-heading">{copy.heading}</h2>

      <div className="rv-summary">
        <div className="rv-summary-score">
          <StarRating value={average} size="md" ariaLabel={`${average}/5`} />
          <span className="rv-summary-avg">{average.toFixed(1)}/5</span>
          <span className="rv-summary-count">
            {total} {copy.reviewsUnit}
          </span>
        </div>
        <div className="rv-breakdown">
          {breakdown.map(({ star, count, percent }) => (
            <div key={star} className="rv-breakdown-row">
              <span className="rv-breakdown-star">{star} ★</span>
              <span className="rv-breakdown-bar">
                <span className="rv-breakdown-fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="rv-breakdown-count">{count}</span>
            </div>
          ))}
        </div>
        <div className="rv-summary-cta">
          <WriteReviewControl slug={slug} locale={locale} />
        </div>
      </div>

      <MyPendingReviewPanel productId={productId} locale={locale} />

      {total === 0 ? <p className="rv-empty">{copy.empty}</p> : null}

      <ul className="rv-list">
        {(list.items ?? []).map((review) => (
          <li key={review.id} className="rv-item">
            <div className="rv-item-head">
              <span className="rv-item-author">{review.userName}</span>
              <span className="rv-stars-static" aria-label={`${review.rating}/5`}>
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}
              </span>
              {review.verifiedPurchase ? <ReviewBadge label={copy.verified} /> : null}
              <time className="rv-item-date" dateTime={review.createdAt}>
                {formatDate(review.createdAt, locale)}
              </time>
            </div>
            {review.title ? <p className="rv-item-title">{review.title}</p> : null}
            <p className="rv-item-content">{review.content}</p>
          </li>
        ))}
      </ul>

      {totalPages > 1 ? (
        <nav className="rv-pagination" aria-label={copy.heading}>
          {reviewPage > 1 ? (
            <Link className="rv-page-link" href={pageHref(slug, locale, reviewPage - 1)}>
              ‹ {copy.prev}
            </Link>
          ) : null}
          <span className="rv-page-info">
            {reviewPage}/{totalPages}
          </span>
          {reviewPage < totalPages ? (
            <Link className="rv-page-link" href={pageHref(slug, locale, reviewPage + 1)}>
              {copy.next} ›
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function averageOf(list: ReviewList): number {
  let sum = 0;
  let count = 0;
  for (const [star, value] of Object.entries(list.breakdown ?? {})) {
    const n = Number(star);
    sum += n * Number(value ?? 0);
    count += Number(value ?? 0);
  }
  return count === 0 ? 0 : Math.round((sum / count) * 10) / 10;
}

function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return locale === 'vi' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

function pageHref(slug: string, locale: Locale, page: number): string {
  const base = localePath(`/p/${slug}`, locale);
  return page <= 1 ? base : `${base}?reviewPage=${page}`;
}
