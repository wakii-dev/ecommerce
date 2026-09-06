import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Nội dung góc phải header (vd nút actions) */
  actions?: ReactNode;
  children?: ReactNode;
}

export function Card({
  title,
  subtitle,
  actions,
  className,
  children,
  ...rest
}: CardProps) {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <div
      className={['uk-card', className ?? null].filter(Boolean).join(' ')}
      {...rest}
    >
      {hasHeader ? (
        <div className="uk-card__header">
          <div>
            {title !== undefined ? (
              <h3 className="uk-card__title">{title}</h3>
            ) : null}
            {subtitle !== undefined ? (
              <p className="uk-card__subtitle">{subtitle}</p>
            ) : null}
          </div>
          {actions !== undefined ? <div>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
