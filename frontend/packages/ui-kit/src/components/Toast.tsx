import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from 'react';
import type { ReactNode } from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  variant?: ToastVariant;
  /** ms tự ẩn; 0 = không tự ẩn (mặc định 4000) */
  duration?: number;
}

export interface ToastItem {
  id: number;
  message: ReactNode;
  variant: ToastVariant;
}

export interface ToastApi {
  /** Hiện toast, trả về id để dismiss thủ công */
  toast: (message: ReactNode, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children?: ReactNode;
  /** Class region toast (mặc định .uk-toast-region góc phải-dưới) */
  regionClassName?: string;
}

export function ToastProvider({
  children,
  regionClassName
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: ReactNode, options?: ToastOptions) => {
      const id = nextId.current++;
      const variant = options?.variant ?? 'info';
      const duration = options?.duration ?? 4000;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (duration > 0 && typeof window !== 'undefined') {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
      return id;
    },
    []
  );

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className={regionClassName ?? 'uk-toast-region'}
        role="region"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`uk-toast uk-toast--${t.variant}`}
            role="status"
          >
            <span className="uk-toast__message">{t.message}</span>
            <button
              type="button"
              className="uk-toast__close"
              aria-label="Đóng thông báo"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Truy cập toast API — phải nằm trong <ToastProvider> */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast phải được dùng bên trong <ToastProvider>');
  }
  return ctx;
}
