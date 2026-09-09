'use client';

import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface StepperStep {
  key: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index bước hiện tại */
  current: number;
  /** Có → nút step done (index < current) + current click-able; chưa tới → disabled */
  onStepClick?: (index: number) => void;
  /** Nhãn aria cho <ol> — default 'Tiến trình' (ui.stepper.label) */
  label?: string;
  className?: string;
}

/** Stepper checkout — nút thật (keyboard miễn phí, khác stepper cũ role=button).
 * ArrowLeft/Right: roving-lite — move focus giữa các dot enabled, KHÔNG đổi
 * current; Enter/Space là click mặc định của button. */
export function Stepper({
  steps,
  current,
  onStepClick,
  label = 'Tiến trình',
  className
}: StepperProps) {
  const listRef = useRef<HTMLOListElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dots = listRef.current?.querySelectorAll<HTMLButtonElement>(
      '.uk-stepper__dot:not(:disabled)'
    );
    if (!dots || dots.length === 0) return;
    const enabled = Array.from(dots);
    const pos = enabled.indexOf(e.currentTarget);
    const next = enabled[pos + (e.key === 'ArrowRight' ? 1 : -1)];
    next?.focus();
  };

  return (
    <ol
      ref={listRef}
      className={['uk-stepper', className ?? null].filter(Boolean).join(' ')}
      aria-label={label}
    >
      {steps.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'future';
        return (
          <li key={step.key} className={`uk-stepper__step uk-stepper__step--${state}`}>
            <button
              type="button"
              className="uk-stepper__dot"
              aria-current={i === current ? 'step' : undefined}
              aria-label={`${i + 1}. ${step.label}`}
              disabled={i > current || !onStepClick}
              onClick={() => onStepClick?.(i)}
              onKeyDown={handleKeyDown}
            >
              {i + 1}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
