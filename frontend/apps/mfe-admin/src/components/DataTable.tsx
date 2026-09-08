import type { ReactElement, ReactNode } from 'react';
import { useT } from '@ecommerce/i18n';
import { TableSkeleton } from '@ecommerce/ui-kit';
import { useClientSort } from '../lib/tableSort';
import type { SortAccessor, SortState } from '../lib/tableSort';

/**
 * DataTable (SF-5 FI-395 T3a) — bảng admin có sort client + sticky thead +
 * skeleton loading + row hover. Thay ui-kit Table trong mfe-admin (ui-kit
 * READ-ONLY — shape cột là superset của TableColumn nên migration page cơ học).
 *
 * Sort mặc định INTERNAL (page giữ đơn giản). Load-all pages cần
 * sort→slice-trang trước khi render → truyền `sort` + `onSortToggle`
 * (controlled) và tự pass pagedRows vào `rows` — khi đó DataTable render
 * rows as-is (không sort lại).
 */

export interface AdminTableColumn<Row> {
  key: string;
  header: ReactNode;
  /** Không truyền → render giá trị (row as Record) — như ui-kit Table. */
  render?: (row: Row) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Có → header thành nút sort (client-side qua accessor này). */
  sortValue?: (row: Row) => string | number | null | undefined;
}

export interface DataTableProps<Row> {
  columns: AdminTableColumn<Row>[];
  rows: Row[];
  /** Key ổn định cho row (mặc định: index). */
  rowKey?: (row: Row, index: number) => string;
  /** Nội dung khi rows rỗng (mặc định: text "Không có dữ liệu"). */
  empty?: ReactNode;
  caption?: string;
  /** true → TableSkeleton trong block (thay Skeleton variant='rect'). */
  loading?: boolean;
  loadingRows?: number;
  className?: string;
  /** Controlled sort — pages load-all tự useClientSort + slice trang. */
  sort?: SortState | null;
  onSortToggle?: (key: string, accessor: SortAccessor<Row>) => void;
  /** Attrs thêm cho từng <tr> (vd data-testid 'review-row'). */
  rowProps?: (row: Row, index: number) => Record<string, string | undefined>;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  loading,
  loadingRows,
  className,
  sort: sortProp,
  onSortToggle,
  rowProps
}: DataTableProps<Row>): ReactElement {
  const { t } = useT();
  const internal = useClientSort(rows);
  const controlled = sortProp !== undefined;
  const activeSort = controlled ? sortProp : internal.sort;
  const displayRows = controlled ? rows : internal.sortedRows;

  const handleSortClick = (col: AdminTableColumn<Row>): void => {
    if (col.sortValue === undefined) return;
    if (controlled && onSortToggle) onSortToggle(col.key, col.sortValue);
    else if (!controlled) internal.toggleSort(col.key, col.sortValue);
  };

  if (loading) {
    return (
      <div className={['admin-table-block', className ?? null].filter(Boolean).join(' ')}>
        <TableSkeleton rows={loadingRows ?? 6} cols={columns.length} />
      </div>
    );
  }

  const alignClass = (align?: AdminTableColumn<Row>['align']) =>
    align === 'right' ? ' uk-table__right' : align === 'center' ? ' admin-table__center' : '';

  const ariaSortOf = (col: AdminTableColumn<Row>): 'ascending' | 'descending' | undefined => {
    if (activeSort === null || activeSort.key !== col.key) return undefined;
    return activeSort.dir === 'asc' ? 'ascending' : 'descending';
  };

  const arrowClassOf = (col: AdminTableColumn<Row>): string => {
    if (activeSort === null || activeSort.key !== col.key) return 'admin-th-sort__arrow--none';
    return activeSort.dir === 'asc'
      ? 'admin-th-sort__arrow--asc'
      : 'admin-th-sort__arrow--desc';
  };

  return (
    <div className={['admin-table-block', className ?? null].filter(Boolean).join(' ')}>
      <table className={['uk-table', 'admin-table', className ?? null].filter(Boolean).join(' ')}>
        {caption ? <caption className="uk-hint">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => {
              const headerText = typeof col.header === 'string' ? col.header : undefined;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSortOf(col)}
                  className={alignClass(col.align).trim() || undefined}
                >
                  {col.sortValue !== undefined ? (
                    <button
                      type="button"
                      className="admin-th-sort"
                      onClick={() => handleSortClick(col)}
                      aria-label={
                        headerText !== undefined
                          ? `${headerText} — ${t('admin.common.sortLabel')}`
                          : t('admin.common.sortLabel')
                      }
                    >
                      {col.header}
                      <span
                        aria-hidden="true"
                        className={`admin-th-sort__arrow ${arrowClassOf(col)}`}
                      >
                        ▲
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {displayRows.length === 0 ? (
            <tr>
              <td className="uk-table__empty" colSpan={columns.length}>
                {empty ?? 'Không có dữ liệu'}
              </td>
            </tr>
          ) : (
            displayRows.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                {...(rowProps ? rowProps(row, i) : undefined)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={alignClass(col.align).trim() || undefined}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
