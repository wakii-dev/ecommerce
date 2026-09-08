import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { Badge, Card, EmptyState, Icon, ListSkeleton } from '@ecommerce/ui-kit';

import { AccountLayout } from '../../AccountLayout';
import { appNavigate, authReady } from '../../bootstrap';
import '../../page.css';

/**
 * My-reviews page (SF-8 pack slice — SF-4 FI-394 T8 elevation): list review
 * của tôi + Badge trạng thái PENDING/APPROVED/REJECTED (variant tints giữ
 * nguyên, label qua keys `account.reviews.*`) + Icon check verified + sao
 * `--c-warning` (tĩnh text — list không interactive, không StarRating) +
 * ListSkeleton khi tải / EmptyState star khi trống. Review card KHÔNG hover
 * cascade (không phải commerce card — direction §4). Fetch self-contained
 * trong page dir. GET /api/catalog/me/reviews là endpoint ADDITIVE ngoài
 * contract (REQUIREMENT-GAP FI-310) → không có typed client, fetch thẳng
 * shape `MeReviewPage`.
 */

export interface MeReview {
  id: string;
  productId: string;
  productName: string | null;
  rating: number;
  title: string | null;
  content: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  verifiedPurchase: boolean;
  createdAt: string;
}

/** Label = i18n key `account.reviews.*` (resolve lúc render qua useT). */
const STATUS_BADGE: Record<MeReview['status'], { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'account.reviews.statusPending', variant: 'warning' },
  APPROVED: { label: 'account.reviews.statusApproved', variant: 'success' },
  REJECTED: { label: 'account.reviews.statusRejected', variant: 'danger' }
};

export default function MyReviewsPage(): ReactElement {
  const { t } = useT();
  const [reviews, setReviews] = useState<MeReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    authReady.then(() => {
      if (!alive) return;
      if (!authStore.isAuthenticated()) {
        appNavigate('/login');
        return;
      }
      authStore
        .fetch('/api/catalog/me/reviews?page=1&size=50')
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: { items?: MeReview[] }) => alive && setReviews(data.items ?? []))
        .catch(() => {
          if (!alive) return;
          setError(t('account.reviews.errorLoad'));
          setReviews([]); // dừng skeleton — alert + empty thay vì tải vô hạn
        });
    });
    // Mount-once (deps rỗng) như các page khác — guard authReady race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AccountLayout active="reviews">
      <div className="acc-content">
        <h1 className="acc-page-title">{t('account.reviews.title')}</h1>
        {error ? (
          <Card>
            <p role="alert">{error}</p>
          </Card>
        ) : null}
        {reviews === null ? (
          <div role="status" aria-label={t('account.reviews.loading')}>
            <ListSkeleton count={3} />
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={<Icon name="star" size={40} />}
            title={t('account.reviews.emptyTitle')}
            description={t('account.reviews.emptyDesc')}
          />
        ) : (
          <div className="mr-list">
            {reviews.map((review) => {
              const badge = STATUS_BADGE[review.status] ?? STATUS_BADGE.PENDING;
              return (
                <Card key={review.id} className="mr-card">
                  <div className="mr-card-head">
                    <span className="mr-card-stars" aria-label={`${review.rating}/5`}>
                      {'★'.repeat(review.rating)}
                      {'☆'.repeat(5 - review.rating)}
                    </span>
                    <Badge variant={badge.variant}>{t(badge.label)}</Badge>
                    {review.verifiedPurchase ? (
                      <span className="mr-card-verified">
                        <Icon name="check" size={14} />
                        {t('account.reviews.verified')}
                      </span>
                    ) : null}
                    <time className="mr-card-date" dateTime={review.createdAt}>
                      {formatDate(review.createdAt)}
                    </time>
                  </div>
                  <p className="mr-card-product-name">{review.productName ?? t('account.reviews.productFallback')}</p>
                  {review.title ? <p className="mr-card-title">{review.title}</p> : null}
                  <p className="mr-card-content">{review.content}</p>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AccountLayout>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}
