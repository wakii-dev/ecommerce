'use client';

import type { ChangeEvent } from 'react';

export interface QuantityStepperProps {
  /** Giá trị hiện tại — controlled thuần, không state nội bộ */
  value: number;
  onChange: (next: number) => void;
  /** Cận dưới — default 1 */
  min?: number;
  /** Cận trên — default 99 */
  max?: number;
  /** Nhãn aria group + input — default 'Số lượng' (ui.quantityStepper.label) */
  label?: string;
  /** default 'Tăng số lượng' (ui.quantityStepper.increase) */
  increaseLabel?: string;
  /** default 'Giảm số lượng' (ui.quantityStepper.decrease) */
  decreaseLabel?: string;
  disabled?: boolean;
  className?: string;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

/** Stepper −/input/+ — controlled; glyph − là ký tự &minus; (U+2212). */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label = 'Số lượng',
  increaseLabel = 'Tăng số lượng',
  decreaseLabel = 'Giảm số lượng',
  disabled = false,
  className
}: QuantityStepperProps) {
  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(e.target.value, 10);
    // Gõ dở ("", "-") → NaN → bỏ qua, không đẩy giá trị rác lên surface
    if (!Number.isNaN(parsed)) {
      onChange(clamp(parsed, min, max));
    }
  };

  return (
    <div
      className={['uk-qty', className ?? null].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="uk-qty__btn"
        aria-label={decreaseLabel}
        disabled={value <= min || disabled}
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        &minus;
      </button>
      <input
        type="number"
        className="uk-qty__value"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={handleInput}
      />
      <button
        type="button"
        className="uk-qty__btn"
        aria-label={increaseLabel}
        disabled={value >= max || disabled}
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        +
      </button>
    </div>
  );
}
