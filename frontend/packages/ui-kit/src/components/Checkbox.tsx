import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Nhãn bên phải custom box — không truyền = không render label */
  label?: string;
  /** Lỗi hiện dưới (box viền đỏ, ưu tiên hơn hint) */
  error?: string;
  hint?: string;
}

/** Checkbox custom box 18×18 — input visually-hidden NHƯNG focusable
 * (pattern Input: useId, aria-invalid, aria-describedby error>hint). Server-safe. */
export function Checkbox({
  label,
  error,
  hint,
  id,
  className,
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  return (
    <div
      className={['uk-check', className ?? null].filter(Boolean).join(' ')}
    >
      <input
        type="checkbox"
        id={inputId}
        className="uk-check__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      <span className="uk-check__box" aria-hidden="true" />
      {label ? (
        <label className="uk-check__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      {error ? (
        <p className="uk-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="uk-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
