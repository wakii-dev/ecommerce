import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Stepper } from '../Stepper';

/**
 * Interaction test Stepper (FI-391 T10) — jsdom: roving-lite keyboard + click.
 * SSR markup (aria-current/done class) phủ ở uiKit.test.tsx.
 */
const STEPS = [
  { key: 'cart', label: 'Giỏ hàng' },
  { key: 'pay', label: 'Thanh toán' },
  { key: 'confirm', label: 'Xác nhận' }
];

afterEach(() => {
  cleanup();
});

describe('Stepper — keyboard & click', () => {
  it('click dot step 0 (current=1) → onStepClick(0)', () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={STEPS} current={1} onStepClick={onStepClick} />);
    fireEvent.click(screen.getByRole('button', { name: '1. Giỏ hàng' }));
    expect(onStepClick).toHaveBeenCalledTimes(1);
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('ArrowRight trên dot 0 → focus chuyển sang dot 1, KHÔNG bắn onStepClick', () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={STEPS} current={1} onStepClick={onStepClick} />);
    const dot0 = screen.getByRole('button', { name: '1. Giỏ hàng' });
    const dot1 = screen.getByRole('button', { name: '2. Thanh toán' });
    dot0.focus();
    fireEvent.keyDown(dot0, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(dot1);
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it('ArrowLeft trên dot 1 (current) → focus lùi về dot 0', () => {
    render(<Stepper steps={STEPS} current={1} onStepClick={() => {}} />);
    const dot0 = screen.getByRole('button', { name: '1. Giỏ hàng' });
    const dot1 = screen.getByRole('button', { name: '2. Thanh toán' });
    dot1.focus();
    fireEvent.keyDown(dot1, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(dot0);
  });

  it('ArrowRight trên dot cuối enabled → giữ nguyên focus (clamp, không wrap)', () => {
    render(<Stepper steps={STEPS} current={1} onStepClick={() => {}} />);
    const dot1 = screen.getByRole('button', { name: '2. Thanh toán' });
    dot1.focus();
    fireEvent.keyDown(dot1, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(dot1);
  });

  it('future dot disabled; không onStepClick → mọi dot disabled (kể cả current)', () => {
    const { rerender } = render(
      <Stepper steps={STEPS} current={1} onStepClick={() => {}} />
    );
    expect(
      (screen.getByRole('button', { name: '3. Xác nhận' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: '1. Giỏ hàng' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);

    rerender(<Stepper steps={STEPS} current={1} />);
    for (const name of ['1. Giỏ hàng', '2. Thanh toán', '3. Xác nhận']) {
      expect(
        (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
      ).toBe(true);
    }
  });
});
