// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from '../src/components/DataTable';

interface Row {
  id: string;
  giaTri: number;
}

const columns = [
  { key: 'giaTri', header: 'Giá trị', sortValue: (r: Row) => r.giaTri },
  { key: 'id', header: 'Mã' }
];

afterEach(() => {
  cleanup();
});

describe('DataTable sortable header (FI-395 — sort header bỏ aria-label)', () => {
  it('nút sort KHÔNG aria-label, tên truy cập = text header, mũi tên aria-hidden', () => {
    render(<DataTable columns={columns} rows={[{ id: 'c1', giaTri: 15 }]} />);
    const btn = screen.getByRole('button', { name: 'Giá trị' }) as HTMLButtonElement;
    // Regression FI-395: aria-label "Giá trị — Sắp xếp" từng substring-trùng
    // getByLabel('Giá trị') trong e2e admin-coupon → strict mode violation.
    expect(btn.getAttribute('aria-label')).toBeNull();
    // getByLabel('Giá trị') giờ KHÔNG khớp nút sort nữa (chỉ khớp input form).
    expect(screen.queryByLabelText('Giá trị')).toBeNull();
    // Accessible name vẫn đầy đủ cho screen reader — đến từ nội dung hiển thị.
    expect(btn.textContent).toContain('Giá trị');
    // Mũi tên trang trí — ẩn khỏi cây truy cập, không cộng vào tên nút.
    const arrow = btn.querySelector('.admin-th-sort__arrow') as HTMLElement;
    expect(arrow.getAttribute('aria-hidden')).toBe('true');
    // Cột không sortValue vẫn render header thường (không có nút).
    expect(screen.queryByRole('button', { name: 'Mã' })).toBeNull();
    expect(screen.getByText('Mã')).toBeTruthy();
  });
});
