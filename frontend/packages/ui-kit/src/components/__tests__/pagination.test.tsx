import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Pagination } from '../Pagination';

/**
 * Interaction test client-mode Pagination (FI-391 T7) — chạy trong jsdom
 * (xem vitest.config.ts). SSR markup phủ ở uiKit.test.tsx.
 */
afterEach(() => {
  cleanup();
});

describe('Pagination — client mode', () => {
  it('click nút trang 3 → onPageChange(3)', () => {
    const onPageChange = vi.fn();
    // page=2 → window {1,2,3,…,12} chứa nút "Trang 3"
    render(<Pagination page={2} totalPages={12} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trang 3' }));
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('nút ‹ / › mang aria-label Trang trước/Sau và bắn đúng trang kề', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={5} totalPages={12} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 4);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 6);
  });

  it('page giữa window có 2 dấu … → cả hai render + không cảnh báo duplicate key', () => {
    // Regression fix-T7: window {1,…,4,5,6,…,12} có 2 ellipsis — key "dots"
    // cố định từng gây "Encountered two children with the same key".
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Pagination page={5} totalPages={12} onPageChange={() => {}} />);
    expect(screen.getAllByText('…')).toHaveLength(2);
    const duplicateKeyCall = errSpy.mock.calls.find((args) =>
      args.some(
        (a) =>
          typeof a === 'string' && /same key|duplicate key/i.test(a)
      )
    );
    expect(duplicateKeyCall).toBeUndefined();
    errSpy.mockRestore();
  });
});
