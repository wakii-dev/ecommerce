// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compareRows, useClientSort } from '../src/lib/tableSort';

interface Row {
  name: string;
  qty: number;
  note?: string | null;
}

const ROWS: Row[] = [
  { name: 'Đào', qty: 3, note: 'x' },
  { name: 'Ăn', qty: 1 },
  { name: 'Ban', qty: 2, note: 'y' }
];

const byName = (r: Row): string => r.name;
const byQty = (r: Row): number => r.qty;
const byNote = (r: Row): string | null | undefined => r.note ?? null;

describe('compareRows', () => {
  it('numeric asc', () => {
    const sorted = [...ROWS].sort((a, b) => compareRows(a, b, byQty, 'asc'));
    expect(sorted.map((r) => r.qty)).toEqual([1, 2, 3]);
  });

  it('numeric desc', () => {
    const sorted = [...ROWS].sort((a, b) => compareRows(a, b, byQty, 'desc'));
    expect(sorted.map((r) => r.qty)).toEqual([3, 2, 1]);
  });

  it('string asc dùng locale vi (Ăn < Ban < Đào)', () => {
    const sorted = [...ROWS].sort((a, b) => compareRows(a, b, byName, 'asc'));
    expect(sorted.map((r) => r.name)).toEqual(['Ăn', 'Ban', 'Đào']);
  });

  it('string desc đảo thứ tự vi', () => {
    const sorted = [...ROWS].sort((a, b) => compareRows(a, b, byName, 'desc'));
    expect(sorted.map((r) => r.name)).toEqual(['Đào', 'Ban', 'Ăn']);
  });

  it('null/undefined luôn CUỐI cả asc lẫn desc', () => {
    const asc = [...ROWS].sort((a, b) => compareRows(a, b, byNote, 'asc'));
    expect(asc[asc.length - 1]?.name).toBe('Ăn'); // note undefined

    const desc = [...ROWS].sort((a, b) => compareRows(a, b, byNote, 'desc'));
    expect(desc[desc.length - 1]?.name).toBe('Ăn');
  });

  it('2 giá trị null cùng nhau → giữ nguyên (0)', () => {
    const a: Row = { name: 'a', qty: 1 };
    const b: Row = { name: 'b', qty: 2 };
    expect(compareRows(a, b, byNote, 'asc')).toBe(0);
    expect(compareRows(a, b, byNote, 'desc')).toBe(0);
  });
});

describe('useClientSort', () => {
  it('cycle cùng key: asc → desc → none (clear)', () => {
    const { result } = renderHook(() => useClientSort(ROWS));

    expect(result.current.sort).toBeNull();

    act(() => result.current.toggleSort('qty', byQty));
    expect(result.current.sort).toEqual({ key: 'qty', dir: 'asc' });

    act(() => result.current.toggleSort('qty', byQty));
    expect(result.current.sort).toEqual({ key: 'qty', dir: 'desc' });

    act(() => result.current.toggleSort('qty', byQty));
    expect(result.current.sort).toBeNull();
  });

  it('key mới sau khi đang sort → bắt đầu asc', () => {
    const { result } = renderHook(() => useClientSort(ROWS));

    act(() => result.current.toggleSort('qty', byQty));
    act(() => result.current.toggleSort('qty', byQty)); // desc
    act(() => result.current.toggleSort('name', byName));

    expect(result.current.sort).toEqual({ key: 'name', dir: 'asc' });
  });

  it('sortedRows áp accessor + dir; clear → thứ tự gốc', () => {
    const { result } = renderHook(() => useClientSort(ROWS));

    act(() => result.current.toggleSort('qty', byQty));
    expect(result.current.sortedRows.map((r) => r.qty)).toEqual([1, 2, 3]);

    act(() => result.current.toggleSort('qty', byQty));
    expect(result.current.sortedRows.map((r) => r.qty)).toEqual([3, 2, 1]);

    act(() => result.current.toggleSort('qty', byQty));
    expect(result.current.sortedRows).toBe(ROWS); // không sort → cùng ref
  });

  it('sort giữ qua rows mới (page server đổi) — sort lại rows hiện tại', () => {
    const { result, rerender } = renderHook(
      ({ rows }: { rows: Row[] }) => useClientSort(rows),
      { initialProps: { rows: ROWS } }
    );

    act(() => result.current.toggleSort('qty', byQty));

    const nextPage: Row[] = [
      { name: 'b', qty: 10 },
      { name: 'a', qty: 5 }
    ];
    rerender({ rows: nextPage });

    expect(result.current.sort).toEqual({ key: 'qty', dir: 'asc' });
    expect(result.current.sortedRows.map((r) => r.qty)).toEqual([5, 10]);
  });
});
