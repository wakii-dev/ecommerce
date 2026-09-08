import type { ReactElement } from 'react';

/**
 * PageSizeSelect (SF-5 FI-395 T3a) — nhóm nút chọn số dòng 10/25/50.
 * Label truyền vào từ page (không phụ thuộc i18n — convention component
 * thuần của mfe-admin, giống ui-kit primitive).
 */

const SIZES = [10, 25, 50] as const;

export interface PageSizeSelectProps {
  value: number;
  onChange: (n: number) => void;
  label: string;
}

export function PageSizeSelect({
  value,
  onChange,
  label
}: PageSizeSelectProps): ReactElement {
  return (
    <div className="admin-pagesize" role="group" aria-label={label}>
      <span className="admin-pagesize__label">{label}</span>
      {SIZES.map((n) => (
        <button
          key={n}
          type="button"
          className={
            n === value
              ? 'admin-pagesize__btn admin-pagesize__btn--active'
              : 'admin-pagesize__btn'
          }
          aria-pressed={n === value}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
