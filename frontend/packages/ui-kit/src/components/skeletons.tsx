import type { ReactElement } from 'react';
import { Skeleton } from './Skeleton';

/**
 * Skeleton compositions (FI-391 T12 — hand-off §2.5) — 3 pattern loading
 * phổ biến, đều compose từ Skeleton primitive (đã aria-hidden + shimmer).
 * KHÔNG dùng <table> thật: chỉ reserve CLS — consumer thay bằng table
 * khi data về.
 */

function cx(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Card sản phẩm: thumb vuông (aspect 1/1) + 2 dòng text + dòng giá 60%. */
export function ProductCardSkeleton({
  className
}: {
  className?: string;
}): ReactElement {
  return (
    <div className={cx('uk-sk-card', className)} aria-busy="true">
      <Skeleton variant="rect" height="auto" className="uk-sk-card__thumb" />
      <div className="uk-sk-card__body">
        <Skeleton variant="text" width="100%" height={14} />
        <Skeleton variant="text" width="70%" height={14} />
        <Skeleton variant="text" width="60%" height={16} className="uk-sk-card__price" />
      </div>
    </div>
  );
}

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

/** Bảng đang tải: role="table" aria-busy — hàng 38px radius-md. */
export function TableSkeleton({
  rows = 5,
  cols = 4,
  className
}: TableSkeletonProps): ReactElement {
  const rowIdx = Array.from({ length: Math.max(1, rows) }, (_, i) => i);
  const colIdx = Array.from({ length: Math.max(1, cols) }, (_, i) => i);

  return (
    <div
      role="table"
      aria-busy="true"
      aria-label="Đang tải dữ liệu"
      className={cx('uk-sk-table', className)}
    >
      {rowIdx.map((r) => (
        <div key={r} role="row" className="uk-sk-table__row">
          {colIdx.map((c) => (
            <div key={c} role="cell" className="uk-sk-table__cell">
              <Skeleton variant="rect" height={14} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Danh sách đang tải: mỗi hàng = circle 40 + 2 dòng text. */
export function ListSkeleton({
  count = 3,
  className
}: {
  count?: number;
  className?: string;
}): ReactElement {
  const items = Array.from({ length: Math.max(1, count) }, (_, i) => i);

  return (
    <div className={cx('uk-sk-list', className)} aria-busy="true">
      {items.map((i) => (
        <div key={i} className="uk-sk-list__item">
          <Skeleton variant="circle" width={40} height={40} />
          <div className="uk-sk-list__text">
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="45%" />
          </div>
        </div>
      ))}
    </div>
  );
}
