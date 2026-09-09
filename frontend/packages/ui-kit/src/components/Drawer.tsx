'use client';

import { createPortal } from 'react-dom';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useOverlay } from './useOverlay';

export type DrawerSide = 'left' | 'right';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Hơi trượt ra từ cạnh nào (mặc định phải) */
  side?: DrawerSide;
  title?: ReactNode;
  footer?: ReactNode;
  /** Click nền overlay để đóng (mặc định true; ESC luôn đóng) */
  closeOnOverlay?: boolean;
  children?: ReactNode;
}

/**
 * Client component — portal qua createPortal trong render (xem Modal).
 */
export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  footer,
  closeOnOverlay = true,
  children
}: DrawerProps) {
  const overlay = useOverlay({ open, onClose });
  const titleId = useId();

  if (!open || !overlay.container) return null;

  return createPortal(
    <div
      className="uk-overlay uk-overlay--drawer"
      {...(closeOnOverlay ? overlay.overlayProps : {})}
    >
      <div
        ref={overlay.panelRef}
        className={`uk-drawer uk-drawer--${side}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        {...overlay.panelProps}
      >
        <header className="uk-drawer__header">
          {title !== undefined ? (
            <h2 id={titleId} className="uk-drawer__title">
              {title}
            </h2>
          ) : null}
          <button
            type="button"
            className="uk-modal__close"
            aria-label="Đóng"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="uk-drawer__body">{children}</div>
        {footer !== undefined ? (
          <footer className="uk-drawer__footer">{footer}</footer>
        ) : null}
      </div>
    </div>,
    overlay.container
  );
}
