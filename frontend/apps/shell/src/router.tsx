import { useEffect, useState } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactElement, ReactNode } from 'react';

// Routing tự dựng bằng History API — Task 14 KHÔNG dùng react-router (routing
// là của shell, harness không thêm dep). Đủ dùng cho 3 route tĩnh.

/** Điều hướng + báo cho mọi usePath() (kể cả navigate bằng code). */
export function navigate(to: string): void {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Path hiện tại, sync với nút back/forward của browser qua popstate. */
export function usePath(): string {
  const [path, setPath] = useState<string>(() => window.location.pathname);
  useEffect(() => {
    const onPop = (): void => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: ReactNode;
}

/** <a> giữ được open-in-new-tab (modifier click đi qua); còn lại SPA navigate. */
export function Link({ to, children, onClick, ...rest }: LinkProps): ReactElement {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
