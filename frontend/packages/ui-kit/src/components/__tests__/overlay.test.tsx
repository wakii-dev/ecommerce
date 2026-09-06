import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Drawer } from '../Drawer';
import { Modal } from '../Modal';

/**
 * Interaction tests cho useOverlay (R3 P1-2) — chạy trong jsdom (xem
 * vitest.config.ts). useOverlay gắn listener lên document + portal vào body,
 * nên renderToStaticMarkup (test cũ) không phủ được.
 */
afterEach(() => {
  cleanup();
  // RTL không dọn body style — scroll-lock test đặt tay, phải reset
  document.body.style.overflow = '';
});

describe('useOverlay qua Modal — ESC', () => {
  it('Escape → onClose đúng 1 lần; phím khác không đóng', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        Nội dung
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('modal đóng (open=false) → không lắng nghe ESC', () => {
    const onClose = vi.fn();
    render(
      <Modal open={false} onClose={onClose}>
        Ẩn
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useOverlay qua Modal — focus trap', () => {
  it('mở → focus phần tử đầu; Tab từ cuối → wrap về đầu; Shift+Tab từ đầu → về cuối', () => {
    render(
      <Modal open onClose={() => {}}>
        <input aria-label="Trường A" />
        <input aria-label="Trường B" />
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    // Nút × (aria-label "Đóng") là focusable ĐẦU trong panel
    const closeButton = screen.getByRole('button', { name: 'Đóng' });
    const truongB = screen.getByLabelText('Trường B');

    // Mở modal → auto-focus phần tử focusable đầu (effect của useOverlay)
    expect(document.activeElement).toBe(closeButton);

    // Tab từ focusable CUỐI → wrap về đầu
    truongB.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    // Shift+Tab từ đầu → nhảy về cuối
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(truongB);
  });
});

describe('useOverlay qua Modal — scroll-lock', () => {
  it('mở → body overflow hidden; unmount → restore giá trị cũ', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = render(
      <Modal open onClose={() => {}}>
        x
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('open=false → không đụng body overflow', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        x
      </Modal>
    );
    expect(document.body.style.overflow).toBe('');
  });
});

describe('useOverlay qua Modal — click overlay', () => {
  it('mousedown backdrop → onClose; mousedown trong panel → không đóng', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        x
      </Modal>
    );
    // Click NỀN (target === currentTarget)
    fireEvent.mouseDown(document.querySelector('.uk-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Click TRONG panel (target ≠ currentTarget) → không đóng
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useOverlay qua Drawer — cùng cơ chế', () => {
  it('ESC đóng + mousedown backdrop đóng', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Bộ lọc">
        x
      </Drawer>
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.querySelector('.uk-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
