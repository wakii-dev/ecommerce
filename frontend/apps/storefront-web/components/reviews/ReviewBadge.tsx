import type { ReactElement } from 'react';

/**
 * Badge "Mua đã xác nhận" (SF-8) — social proof kiểu Tiki: chỉ gán khi user
 * có review_eligibility từ event order.confirmed (badge VERIFY, không phải
 * tự khai). Server-safe (không client).
 */
export default function ReviewBadge({ label }: { label: string }): ReactElement {
  return (
    <span className="rv-verified" title={label}>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
        />
      </svg>
      {label}
    </span>
  );
}
