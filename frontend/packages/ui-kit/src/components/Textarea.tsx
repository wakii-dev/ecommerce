import { useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Nhãn phía trên textarea — không truyền = không render label */
  label?: string;
  /** Lỗi hiện dưới (viền đỏ, ưu tiên hơn hint) */
  error?: string;
  hint?: string;
}

/** Textarea pattern Input.tsx — resize vertical, min-height 80. Server-safe. */
export function Textarea({
  label,
  error,
  hint,
  id,
  className,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const taId = id ?? autoId;
  const describedBy = error
    ? `${taId}-error`
    : hint
      ? `${taId}-hint`
      : undefined;

  return (
    <div className="uk-field">
      {label ? (
        <label className="uk-label" htmlFor={taId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={taId}
        className={[
          'uk-textarea',
          error ? 'uk-textarea--error' : null,
          className ?? null
        ]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <p className="uk-error" id={`${taId}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="uk-hint" id={`${taId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
