import type { HTMLAttributes } from 'react';

export type BadgeVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  variant = 'neutral',
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        'uk-badge',
        `uk-badge--${variant}`,
        className ?? null
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}
