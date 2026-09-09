'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

import { authedFetch, ensureSession } from '../../lib/account-session';
import type { Locale } from '../../lib/format';
import { t } from '../../lib/i18n';
import WriteReviewModal from './WriteReviewModal';

/**
 * My-pending review panel (SF-8 — pack "my-review edit/delete khi PENDING"):
 * user đăng nhập có review PENDING cho product này → hiện card + Sửa (modal
 * PUT me/reviews) + Xóa (DELETE). Guest / không có → không render.
 * ADDITIVE ngoài contract (REQUIREMENT-GAP FI-310 — spec Q1).
 * T12: copy trong lib/i18n (miền `reviews`).
 */

interface PendingReview {
  id: string;
  rating: number;
  title: string | null;
  content: string;
}

export default function MyPendingReviewPanel({
  productId,
  locale,
}: {
  productId: string;
  locale: Locale;
}): ReactElement | null {
  const router = useRouter();
  const [review, setReview] = useState<PendingReview | null>(null);
  const [checked, setChecked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (message?: string): void => {
    // Server section (parent) không nhận callback từ client island (RSC
    // boundary) — panel tự refresh section + toast nội bộ.
    if (message) setToast(message);
    router.refresh();
    window.setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    let alive = true;
    ensureSession().then((ok) => {
      if (!ok || !alive) {
        if (alive) setChecked(true);
        return;
      }
      authedFetch(`/api/catalog/me/reviews?productId=${encodeURIComponent(productId)}&size=20`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!alive) return;
          const pending = (data?.items ?? []).find((item: { status?: string }) => item.status === 'PENDING');
          setReview(pending ? { id: pending.id, rating: pending.rating, title: pending.title, content: pending.content } : null);
          setChecked(true);
        })
        .catch(() => alive && setChecked(true));
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  if (!checked) return null;
  if (!review) {
    return toast ? (
      <div className="rv-toast" role="status">
        {toast}
      </div>
    ) : null;
  }

  const onDelete = (): void => {
    setRemoving(true);
    authedFetch(`/api/catalog/me/reviews/${review.id}`, { method: 'DELETE' })
      .then((res) => {
        if (res.status === 204) {
          setReview(null);
          notify(t(locale, 'reviews.removed'));
        } else {
          notify(t(locale, 'reviews.deleteFail'));
        }
      })
      .catch(() => notify(t(locale, 'reviews.deleteFail')))
      .finally(() => setRemoving(false));
  };

  return (
    <div className="rv-mine">
      <p className="rv-mine-heading">{t(locale, 'reviews.pendingHeading')}</p>
      <div className="rv-item">
        <div className="rv-item-head">
          <span className="rv-stars-static" aria-label={`${review.rating}/5`}>
            {'★'.repeat(review.rating)}
            {'☆'.repeat(5 - review.rating)}
          </span>
          <span className="rv-status rv-status--pending">{t(locale, 'reviews.statusPending')}</span>
        </div>
        {review.title ? <p className="rv-item-title">{review.title}</p> : null}
        <p className="rv-item-content">{review.content}</p>
        <div className="rv-mine-actions">
          <button type="button" className="rv-link" onClick={() => setEditing(true)}>
            {t(locale, 'reviews.edit')}
          </button>
          <button type="button" className="rv-link rv-link--danger" onClick={onDelete} disabled={removing}>
            {removing ? t(locale, 'reviews.removing') : t(locale, 'reviews.remove')}
          </button>
        </div>
      </div>
      {toast ? (
        <div className="rv-toast" role="status">
          {toast}
        </div>
      ) : null}
      {editing ? (
        <WriteReviewModal
          slug=""
          locale={locale}
          mode="edit"
          reviewId={review.id}
          initial={{ rating: review.rating, title: review.title ?? '', content: review.content }}
          onClose={() => setEditing(false)}
          onSubmitted={() => {
            setEditing(false);
            notify();
          }}
        />
      ) : null}
    </div>
  );
}
