'use client';

import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { Modal } from '../ui-kit';

import { buildReviewPayload } from '../../lib/reviews-api';
import { authedFetch, ensureSession } from '../../lib/account-session';
import { shellUrl } from '../../lib/site';
import type { Locale } from '../../lib/format';

/**
 * Write-review modal (SF-8, spec Q14 — pack: write modal client component).
 * T9 (FI-392): bọc bằng primitive ui-kit `Modal` (portal + focus-trap + ESC,
 * dialog aria-labelledby từ title). Restore focus về trigger tự lo ở đây —
 * useOverlay chỉ trap/ESC. StarRating interactive local (ui-kit StarRating là
 * readOnly — KHÔNG sửa ui-kit, file slice). Submit 202 no-body → toast "đang
 * chờ duyệt" (client side — spec-critic P0). 409 → message "đã đánh giá".
 * Guest → CTA link `/account` (shell đăng nhập — pack).
 */

const COPY = {
  vi: {
    title: 'Viết đánh giá',
    editTitle: 'Sửa đánh giá của bạn',
    guestTitle: 'Đăng nhập để đánh giá',
    guestDesc: 'Bạn cần đăng nhập tài khoản để viết đánh giá sản phẩm.',
    guestCta: 'Đăng nhập',
    yourRating: 'Đánh giá của bạn',
    nameLabel: 'Tiêu đề (không bắt buộc)',
    contentLabel: 'Nội dung',
    contentPlaceholder: 'Chia sẻ trải nghiệm của bạn về sản phẩm…',
    submit: 'Gửi đánh giá',
    saving: 'Đang gửi…',
    toast: 'Đã gửi đánh giá — đang chờ duyệt',
    toastEdit: 'Đã cập nhật đánh giá — vẫn đang chờ duyệt',
    duplicate: 'Bạn đã đánh giá sản phẩm này rồi',
    error: 'Gửi đánh giá thất bại — thử lại sau ít phút',
    ratingRequired: 'Hãy chọn số sao',
  },
  en: {
    title: 'Write a review',
    editTitle: 'Edit your review',
    guestTitle: 'Sign in to review',
    guestDesc: 'You need an account to review this product.',
    guestCta: 'Sign in',
    yourRating: 'Your rating',
    nameLabel: 'Title (optional)',
    contentLabel: 'Review',
    contentPlaceholder: 'Share your experience with this product…',
    submit: 'Submit review',
    saving: 'Sending…',
    toast: 'Review submitted — pending moderation',
    toastEdit: 'Review updated — still pending moderation',
    duplicate: 'You already reviewed this product',
    error: 'Failed to submit — please try again later',
    ratingRequired: 'Pick a star rating',
  },
} as const;

export interface WriteReviewModalProps {
  slug: string;
  locale: Locale;
  /** edit mode — điền nội dung review PENDING của user. */
  initial?: { rating: number; title: string; content: string };
  mode: 'create' | 'edit';
  /** Edit path — PUT me/reviews/{id}; create → POST slug path. */
  reviewId?: string;
  onClose(): void;
  /** Submit thành công — caller hiện toast + refresh section. */
  onSubmitted(): void;
}

export default function WriteReviewModal({
  slug,
  locale,
  initial,
  mode,
  reviewId,
  onClose,
  onSubmitted,
}: WriteReviewModalProps): ReactElement {
  const copy = COPY[locale];
  const [guest, setGuest] = useState<boolean | null>(null); // null = đang check
  const [rating, setRating] = useState<number>(initial?.rating ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore focus về trigger khi modal unmount — useOverlay chỉ lo trap/ESC.
  // Capture bằng lazy state-init (chạy lúc render): child effect của Modal
  // focus-first vào panel TRƯỚC effect parent — capture trong useEffect sẽ
  // nhận nhầm nút đóng trong portal thay vì trigger.
  const [restoreTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
  );
  useEffect(() => () => restoreTo?.focus(), []);

  // Boot session lần đầu mở modal — guest → CTA đăng nhập (spec Q13)
  if (guest === null) {
    ensureSession().then((ok) => setGuest(!ok));
    return (
      <Modal open onClose={onClose} title={copy.title} size="md">
        <p className="rv-modal-loading">…</p>
      </Modal>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (rating < 1) {
      setError(copy.ratingRequired);
      return;
    }
    setSending(true);
    try {
      const payload = buildReviewPayload({ rating, title, content });
      const res = mode === 'edit' && reviewId
        ? await authedFetch(`/api/catalog/me/reviews/${reviewId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await authedFetch(`/api/catalog/products/${encodeURIComponent(slug)}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      if (res.status === 202 || res.status === 200) {
        onSubmitted();
        return;
      }
      if (res.status === 409) {
        setError(copy.duplicate);
      } else {
        setError(copy.error);
      }
    } catch {
      setError(copy.error);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'edit' ? copy.editTitle : copy.title}
      size="md"
    >
      {guest ? (
        <div className="rv-guest">
          <h3>{copy.guestTitle}</h3>
          <p>{copy.guestDesc}</p>
          <a className="rv-cta" href={`${shellUrl()}/account`}>
            {copy.guestCta}
          </a>
        </div>
      ) : (
        <form className="rv-form" onSubmit={onSubmit}>
          <div className="rv-stars-input" role="radiogroup" aria-label={copy.yourRating}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star}`}
                className={star <= rating ? 'rv-star rv-star--on' : 'rv-star'}
                onClick={() => setRating(star)}
              >
                ★
              </button>
            ))}
          </div>

          <label className="rv-label">
            {copy.nameLabel}
            <input
              className="rv-input"
              value={title}
              maxLength={255}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="rv-label">
            {copy.contentLabel}
            <textarea
              className="rv-input rv-textarea"
              value={content}
              required
              rows={4}
              placeholder={copy.contentPlaceholder}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>

          {error ? (
            <p className="rv-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="rv-cta" disabled={sending}>
            {sending ? copy.saving : copy.submit}
          </button>
        </form>
      )}
    </Modal>
  );
}
