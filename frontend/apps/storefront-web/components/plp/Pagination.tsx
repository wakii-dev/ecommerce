import { buildPlpUrl, pageWindow, type PlpQuery } from '../../lib/plp-params';

/**
 * Pagination PLP §2.4: nút 34×34, active nền primary chữ trắng; window ±2 với
 * đầu/cuối + ellipsis; prev/next. Toàn bộ link URL-driven (SEO-friendly,
 * không JS) — giữ trọn filters + sort hiện tại, chỉ đổi `page`.
 * totalPages ≤ 1 → không render.
 */
export interface PaginationProps {
  basePath: string;
  query: PlpQuery;
  totalPages: number;
  /** Tham số giữ nguyên qua các trang ngoài filters/sort — /search truyền `{ q }` (Task 14). */
  extraParams?: Record<string, string | undefined>;
}

export default function Pagination({ basePath, query, totalPages, extraParams }: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = pageWindow(query.page, totalPages);

  return (
    <nav className="plp-pagination" aria-label="Phân trang">
      {query.page > 1 ? (
        <a
          className="plp-page-btn plp-page-btn--nav"
          href={buildPlpUrl(basePath, { ...query, page: query.page - 1 }, extraParams)}
          rel="prev"
          aria-label="Trang trước"
        >
          ‹
        </a>
      ) : null}

      {items.map((item, index) =>
        typeof item === 'number' ? (
          <a
            key={item}
            className={`plp-page-btn${item === query.page ? ' is-active' : ''}`}
            href={buildPlpUrl(basePath, { ...query, page: item }, extraParams)}
            aria-current={item === query.page ? 'page' : undefined}
          >
            {item}
          </a>
        ) : (
          <span key={`ellipsis-${index}`} className="plp-page-dots" aria-hidden="true">
            …
          </span>
        ),
      )}

      {query.page < totalPages ? (
        <a
          className="plp-page-btn plp-page-btn--nav"
          href={buildPlpUrl(basePath, { ...query, page: query.page + 1 }, extraParams)}
          rel="next"
          aria-label="Trang sau"
        >
          ›
        </a>
      ) : null}
    </nav>
  );
}
