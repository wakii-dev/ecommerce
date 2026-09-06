import { createPortal } from 'react-dom';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useOverlay } from './useOverlay';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Click nền overlay để đóng (mặc định true; ESC luôn đóng) */
  closeOnOverlay?: boolean;
  children?: ReactNode;
}

/**
 * Client component — app lo client boundary (D16). Portal qua createPortal
 * trong render; ở môi trường không có document (SSR/node) container là null
 * → render null, an toàn tuyệt đối.
 */
export function Modal({
  open,
  onClose,
  title,
  footer,
  size = 'md',
  closeOnOverlay = true,
  children
}: ModalProps) {
  const overlay = useOverlay({ open, onClose });
  const titleId = useId();

  if (!open || !overlay.container) return null;

  return createPortal(
    <div
      className="uk-overlay"
      {...(closeOnOverlay ? overlay.overlayProps : {})}
    >
      <div
        ref={overlay.panelRef}
        className={`uk-modal uk-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        {...overlay.panelProps}
      >
        <header className="uk-modal__header">
          {title !== undefined ? (
            <h2 id={titleId} className="uk-modal__title">
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
        <div className="uk-modal__body">{children}</div>
        {footer !== undefined ? (
          <footer className="uk-modal__footer">{footer}</footer>
        ) : null}
      </div>
    </div>,
    overlay.container
  );
}
