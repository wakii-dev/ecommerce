import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Sort client-side cho admin tables (SF-5 FI-395 T3a) — pure + framework-thin.
 * KHÔNG dependency ngoài react (useState/useMemo/useRef/useCallback).
 */

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

/** Accessor đọc giá trị sort từ row. null/undefined luôn xếp CUỐI. */
export type SortAccessor<T> = (row: T) => string | number | null | undefined;

/**
 * So sánh 2 row theo accessor + chiều dir:
 * - number → so số học.
 * - string → localeCompare locale 'vi' (tiếng Việt có dấu đúng thứ tự).
 * - null/undefined → LUÔN cuối bất kể asc/desc (kỳ vọng người dùng:
 *   thiếu dữ liệu không nhảy lên đầu khi sort desc).
 * Pure — unit test node được.
 */
export function compareRows<T>(
  a: T,
  b: T,
  accessor: SortAccessor<T>,
  dir: SortDir
): number {
  const va = accessor(a);
  const vb = accessor(b);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;

  let cmp: number;
  if (typeof va === 'number' && typeof vb === 'number') {
    cmp = va - vb;
  } else {
    cmp = String(va).localeCompare(String(vb), 'vi');
  }
  return dir === 'asc' ? cmp : -cmp;
}

export interface ClientSortResult<T> {
  /** null = chưa sort (giữ nguyên thứ tự server). */
  sort: SortState | null;
  /** rows đã sort (sort === null → chính mảng rows). */
  sortedRows: T[];
  /** Click header: cùng key asc→desc→none; key mới → asc. */
  toggleSort: (key: string, accessor: SortAccessor<T>) => void;
}

/**
 * Hook sort mảng rows. Sort chỉ áp trên rows hiện tại (server-paged: sort
 * trang hiện tại; load-all: sort toàn bộ trước khi page slice).
 */
export function useClientSort<T>(rows: T[]): ClientSortResult<T> {
  const [sort, setSort] = useState<SortState | null>(null);
  // accessor giữ qua ref — sortedRows nhớ cách sort khi rows đổi (page mới).
  const accessorRef = useRef<SortAccessor<T> | null>(null);

  const toggleSort = useCallback((key: string, accessor: SortAccessor<T>): void => {
    accessorRef.current = accessor;
    setSort((prev) => {
      if (prev === null || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // desc → clear
    });
  }, []);

  const sortedRows = useMemo(() => {
    // Đọc accessorRef.current ngoài deps là CỐ Ý: toggleSort luôn ghi ref
    // TRƯỚC setSort (cùng 1 event handler) → khi memo re-run vì sort đổi,
    // ref đã trỏ đúng accessor của cột vừa click. Accessor là inline closure
    // per-column (identity đổi mỗi render) nên đưa vào deps chỉ gây re-sort thừa.
    const accessor = accessorRef.current;
    if (sort === null || accessor === null) return rows;
    return [...rows].sort((a, b) => compareRows(a, b, accessor, sort.dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sort, sortedRows, toggleSort };
}
