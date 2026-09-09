'use client';

import { useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** <option> của select */
  children?: ReactNode;
}

export function Select({
  label,
  error,
  hint,
  id,
  className,
  children,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error
    ? `${selectId}-error`
    : hint
      ? `${selectId}-hint`
      : undefined;

  return (
    <div className="uk-field">
      {label ? (
        <label className="uk-label" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={[
          'uk-select',
          error ? 'uk-select--error' : null,
          className ?? null
        ]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="uk-error" id={`${selectId}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="uk-hint" id={`${selectId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
