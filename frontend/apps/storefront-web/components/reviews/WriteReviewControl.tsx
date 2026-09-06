'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

import type { Locale } from '../../lib/format';
import WriteReviewModal from './WriteReviewModal';

/**
 * Nút "Viết đánh giá" + modal + toast (client island trong reviews section —
 * server section không giữ state). Submit 202 → toast "đang chờ duyệt" +
 * router.refresh() (re-fetch server section — review mới PENDING vẫn không
 * hiện public nhưng my-pending panel xuất hiện).
 */

const COPY = {
  vi: {
    write: 'Viết đánh giá',
    toast: 'Đã gửi đánh giá — đang chờ duyệt',
  },
  en: {
    write: 'Write a review',
    toast: 'Review submitted — pending moderation',
  },
} as const;

export default function WriteReviewControl({ slug, locale }: { slug: string; locale: Locale }): ReactElement {
  const copy = COPY[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const onSubmitted = (): void => {
    setOpen(false);
    setToast(copy.toast);
    router.refresh();
    window.setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="rv-write-control">
      <button type="button" className="rv-cta" onClick={() => setOpen(true)}>
        ✎ {copy.write}
      </button>

      {toast ? (
        <div className="rv-toast" role="status">
          {toast}
        </div>
      ) : null}

      {open ? (
        <WriteReviewModal slug={slug} locale={locale} mode="create" onClose={() => setOpen(false)} onSubmitted={onSubmitted} />
      ) : null}
    </div>
  );
}
