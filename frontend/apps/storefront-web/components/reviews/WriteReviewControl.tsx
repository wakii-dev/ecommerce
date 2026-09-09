'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

import type { Locale } from '../../lib/format';
import { t } from '../../lib/i18n';
import WriteReviewModal from './WriteReviewModal';

/**
 * Nút "Viết đánh giá" + modal + toast (client island trong reviews section —
 * server section không giữ state). Submit 202 → toast "đang chờ duyệt" +
 * router.refresh() (re-fetch server section — review mới PENDING vẫn không
 * hiện public nhưng my-pending panel xuất hiện). T12: copy trong lib/i18n
 * (reviews.write / reviews.toastPending — dùng chung với WriteReviewModal).
 */

export default function WriteReviewControl({ slug, locale }: { slug: string; locale: Locale }): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const onSubmitted = (): void => {
    setOpen(false);
    setToast(t(locale, 'reviews.toastPending'));
    router.refresh();
    window.setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="rv-write-control">
      <button type="button" className="rv-cta" onClick={() => setOpen(true)}>
        ✎ {t(locale, 'reviews.write')}
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
