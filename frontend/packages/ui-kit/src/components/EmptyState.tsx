import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Icon/graphic phía trên (emoji, svg...) */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Vd nút hành động "Tiếp tục mua sắm" */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={['uk-empty', className ?? null].filter(Boolean).join(' ')}
    >
      {icon !== undefined ? (
        <div className="uk-empty__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="uk-empty__title">{title}</p>
      {description !== undefined ? (
        <p className="uk-empty__description">{description}</p>
      ) : null}
      {action !== undefined ? (
        <div className="uk-empty__action">{action}</div>
      ) : null}
    </div>
  );
}
