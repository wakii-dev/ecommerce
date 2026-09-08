'use client';

export interface PaginationProps {
  /** Trang hiện tại (1-based) */
  page: number;
  totalPages: number;
  /** URL-driven SEO: builder trả href cho trang N — có → render <a> */
  pageHref?: (page: number) => string;
  /** Client: callback — có (và không có pageHref) → render <button> */
  onPageChange?: (page: number) => void;
  /** Nhãn aria cho <nav> — default 'Phân trang' (ui.pagination.label) */
  label?: string;
  /** default 'Trang trước' (ui.pagination.prev) */
  prevLabel?: string;
  /** default 'Trang sau' (ui.pagination.next) */
  nextLabel?: string;
  /** aria cho từng số trang — default `Trang ${page}` (ui.pagination.page) */
  pageLabel?: (page: number) => string;
  className?: string;
}

type PaginationItem = number | 'dots';

/** Window tự chứa: {1, page-1, page, page+1, totalPages} unique, sort,
 * chèn '…' khi gap > 1 — KHÔNG import logic từ storefront-web. */
function buildWindow(page: number, totalPages: number): PaginationItem[] {
  const centers = [page - 1, page, page + 1].filter(
    (p) => p >= 1 && p <= totalPages
  );
  const pages = Array.from(new Set([1, ...centers, totalPages])).sort(
    (a, b) => a - b
  );

  const items: PaginationItem[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) items.push('dots');
    items.push(p);
    prev = p;
  }
  return items;
}

/** 1 component 2 chế độ: pageHref → <a> (SEO, SSR an toàn);
 * chỉ onPageChange → <button> (client). totalPages ≤ 1 → null. */
export function Pagination({
  page,
  totalPages,
  pageHref,
  onPageChange,
  label = 'Phân trang',
  prevLabel = 'Trang trước',
  nextLabel = 'Trang sau',
  pageLabel = (p: number) => `Trang ${p}`,
  className
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const urlMode = typeof pageHref === 'function';

  const itemClass = (p: number) =>
    ['uk-page', p === page ? 'uk-page--active' : null]
      .filter(Boolean)
      .join(' ');

  const renderItem = (p: number) => {
    const active = p === page;
    const aria = { 'aria-label': pageLabel(p) };
    return urlMode ? (
      <a
        key={p}
        href={pageHref!(p)}
        className={itemClass(p)}
        aria-current={active ? 'page' : undefined}
        {...aria}
      >
        {p}
      </a>
    ) : (
      <button
        key={p}
        type="button"
        className={itemClass(p)}
        aria-current={active ? 'page' : undefined}
        onClick={() => onPageChange?.(p)}
        {...aria}
      >
        {p}
      </button>
    );
  };

  return (
    <nav
      className={['uk-pagination', className ?? null]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
    >
      {page > 1 ? (
        urlMode ? (
          <a
            className="uk-page"
            href={pageHref!(page - 1)}
            rel="prev"
            aria-label={prevLabel}
          >
            ‹
          </a>
        ) : (
          <button
            type="button"
            className="uk-page"
            onClick={() => onPageChange?.(page - 1)}
            aria-label={prevLabel}
          >
            ‹
          </button>
        )
      ) : null}

      {buildWindow(page, totalPages).map((item) =>
        item === 'dots' ? (
          <span key="dots" className="uk-page uk-page--dots" aria-hidden="true">
            …
          </span>
        ) : (
          renderItem(item)
        )
      )}

      {page < totalPages ? (
        urlMode ? (
          <a
            className="uk-page"
            href={pageHref!(page + 1)}
            rel="next"
            aria-label={nextLabel}
          >
            ›
          </a>
        ) : (
          <button
            type="button"
            className="uk-page"
            onClick={() => onPageChange?.(page + 1)}
            aria-label={nextLabel}
          >
            ›
          </button>
        )
      ) : null}
    </nav>
  );
}
