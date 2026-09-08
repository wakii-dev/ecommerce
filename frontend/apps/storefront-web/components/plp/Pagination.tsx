'use client';

import { useRouter } from 'next/navigation';

import { Pagination as PaginationPrimitive } from '@ecommerce/ui-kit';

import { buildPlpUrl, type PlpQuery } from '../../lib/plp-params';

/**
 * Pagination PLP — client wrapper quanh primitive ui-kit `Pagination`
 * (direction §2.4/§2.5: dùng primitive; mode URL-driven `pageHref` →
 * `<a>` thật nên no-JS vẫn GET được, primitive tự có rel=prev/next,
 * aria-current, label "Trang N").
 *
 * SPA nav bằng delegation: click `<a>` con → preventDefault + router.push
 * (chạy sau hydration; ctrl/shift/alt/middle-click → để browser mở tab mới,
 * trước hydration → navigation GET bình thường). KHÔNG đổi logic
 * sort/page/filters (§5.3 — URL vẫn là state duy nhất).
 *
 * GIỮ interface cũ (basePath/query/totalPages/extraParams) — 2 page caller
 * không đổi. Locale suy ra từ basePath (en có prefix `/en` — localePath);
 * labels vi/en tạm inline ở đây, Task 12 i18n gom về lib/i18n.
 */
export interface PaginationProps {
  basePath: string;
  query: PlpQuery;
  totalPages: number;
  /** Tham số giữ nguyên qua các trang ngoài filters/sort — /search truyền `{ q }`. */
  extraParams?: Record<string, string | undefined>;
}

export default function Pagination({ basePath, query, totalPages, extraParams }: PaginationProps) {
  const router = useRouter();

  if (totalPages <= 1) return null;

  const en = basePath.startsWith('/en');
  const pageHref = (page: number) => buildPlpUrl(basePath, { ...query, page }, extraParams);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    router.push(href);
  }

  return (
    <div onClick={handleClick}>
      <PaginationPrimitive
        className="plp-pagination"
        page={query.page}
        totalPages={totalPages}
        pageHref={pageHref}
        label={en ? 'Pagination' : 'Phân trang'}
        prevLabel={en ? 'Previous page' : 'Trang trước'}
        nextLabel={en ? 'Next page' : 'Trang sau'}
        pageLabel={(page) => (en ? `Page ${page}` : `Trang ${page}`)}
      />
    </div>
  );
}
