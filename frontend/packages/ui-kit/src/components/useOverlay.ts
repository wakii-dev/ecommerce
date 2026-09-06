import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject
} from 'react';

/**
 * Dùng chung cho Modal + Drawer: portal container, ESC close, focus trap,
 * body scroll-lock, click overlay để đóng.
 *
 * D16 framework-portable: mọi browser API nằm trong effect/handler/lazy
 * state-init (có guard `typeof document === 'undefined'`) — KHÔNG ở top-level.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

export interface OverlayOptions {
  open: boolean;
  onClose: () => void;
}

export interface OverlayApi {
  /** Node mount portal — null khi chưa có document (SSR/node) */
  container: HTMLElement | null;
  /** RefObject.current đã chứa null — gắn thẳng lên panel div */
  panelRef: RefObject<HTMLDivElement>;
  /** Spread lên panel: chặn Tab thoát ra ngoài (focus trap) */
  panelProps: {
    onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  };
  /** Spread lên overlay backdrop: click nền để đóng */
  overlayProps: {
    onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
  };
}

export function useOverlay({ open, onClose }: OverlayOptions): OverlayApi {
  const [container] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.createElement('div')
  );
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Mount/unmount portal container vào body
  useEffect(() => {
    if (!container) return;
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  }, [container]);

  // Scroll-lock body khi mở
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC để đóng
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Focus phần tử focusable đầu tiên trong panel khi mở
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first =
      panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panel;
    first.focus();
  }, [open]);

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (!active || !panel.contains(active)) {
      e.preventDefault();
      if (first) first.focus();
      return;
    }
    if (e.shiftKey && active === first) {
      e.preventDefault();
      if (last) last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      if (first) first.focus();
    }
  };

  const onOverlayMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return {
    container,
    panelRef,
    panelProps: { onKeyDown: onPanelKeyDown },
    overlayProps: { onMouseDown: onOverlayMouseDown }
  };
}
