import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** BẮT BUỘC — nút chỉ có icon, thiếu tên với screen reader → dev-warn console.error (không crash) */
  'aria-label': string;
  /** sm 28px · md 36px — default md */
  size?: 'sm' | 'md';
  /** default ghost */
  variant?: 'ghost' | 'outline';
  /** svg/icon thuần */
  children: ReactNode;
}

/** Nút icon thuần — aria-label là bắt buộc (dev-warn khi thiếu). Server-safe. */
export function IconButton({
  'aria-label': ariaLabel,
  size = 'md',
  variant = 'ghost',
  className,
  children,
  ...rest
}: IconButtonProps) {
  if (!ariaLabel) {
    // Warn MỌI env (types đã bắt buộc aria-label — rơi xuống đây là lỗi caller;
    // không dùng process.env vì tsc program của shell không có @types/node).
    console.error(
      'IconButton: thiếu aria-label — nút icon không có tên với screen reader.'
    );
  }

  return (
    <button
      type="button"
      className={[
        'uk-icon-btn',
        `uk-icon-btn--${size}`,
        `uk-icon-btn--${variant}`,
        className ?? null
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </button>
  );
}
