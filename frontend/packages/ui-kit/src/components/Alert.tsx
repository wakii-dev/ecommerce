'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  /** Tint: info=--tint-primary-*, success=--tint-success-*, warning=--tint-new-*, danger=--pill-cancelled-* */
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  /** Icon trái — optional, KHÔNG default (giữ server-safe thuần) */
  icon?: ReactNode;
  /** Có → nút × tự ẩn Alert (state nội bộ) + bắn onClose */
  dismissible?: boolean;
  onClose?: () => void;
  /** aria-label nút × — default 'Đóng thông báo' (ui.alert.dismiss) */
  dismissLabel?: string;
  className?: string;
}

/** Thông báo tint theo variant — danger role="alert" (ngắt lời), còn lại role="status". */
export function Alert({
  variant = 'info',
  title,
  children,
  icon,
  dismissible = false,
  onClose,
  dismissLabel = 'Đóng thông báo',
  className
}: AlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={['uk-alert', `uk-alert--${variant}`, className ?? null]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? (
        <span className="uk-alert__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="uk-alert__content">
        {title ? <p className="uk-alert__title">{title}</p> : null}
        {children ? <div className="uk-alert__body">{children}</div> : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          className="uk-alert__close"
          aria-label={dismissLabel}
          onClick={() => {
            setDismissed(true);
            onClose?.();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
