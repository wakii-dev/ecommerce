import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { Badge, Card, EmptyState } from '@ecommerce/ui-kit';

import { appNavigate, authReady } from '../../bootstrap';
import '../../page.css';

/**
 * My-reviews page (SF-8 — pack slice `pages/my-reviews/*`): list review của
 * tôi + badge trạng thái PENDING/APPROVED/REJECTED + tên product + sao +
 * nội dung. Fetch self-contained trong page dir. GET /api/catalog/me/reviews
 * là endpoint ADDITIVE ngoài contract (REQUIREMENT-GAP FI-310) → không có
 * typed client, fetch thẳng shape `MeReviewPage`.
 */

interface MeReview {
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

const STATUS_BADGE: Record<MeReview['status'], { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'Chờ duyệt', variant: 'warning' },
  APPROVED: { label: 'Đã duyệt', variant: 'success' },
  REJECTED: { label: 'Bị từ chối', variant: 'danger' },
};

export default function MyReviewsPage(): ReactElement {
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
        .catch(() => alive && setError('Không tải được đánh giá của bạn'));
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="account-page">
      <h1 className="account-title">Đánh giá của tôi</h1>
      {error ? (
        <Card>
          <p role="alert">{error}</p>
        </Card>
      ) : null}
      {reviews === null ? (
        <p>Đang tải…</p>
      ) : reviews.length === 0 ? (
        <EmptyState title="Bạn chưa viết đánh giá nào" description="Vào trang sản phẩm để viết đánh giá đầu tiên." />
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
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {review.verifiedPurchase ? <span className="mr-card-verified">✓ Mua đã xác nhận</span> : null}
                  <time className="mr-card-date" dateTime={review.createdAt}>
                    {formatDate(review.createdAt)}
                  </time>
                </div>
                <p className="mr-card-product-name">{review.productName ?? 'Sản phẩm'}</p>
                {review.title ? <p className="mr-card-title">{review.title}</p> : null}
                <p className="mr-card-content">{review.content}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}
