'use client';

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Pageview GA4 mỗi navigation (SF-13 A7a) — gtag script (app/layout.tsx) chỉ
 * tự bắn pageview lần đầu; App Router navigate client-side không reload nên
 * phải bắn tay theo pathname. Guard window.gtag (script có thể chặn/blocker).
 */
export default function GaPageview(): ReactElement | null {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', 'page_view', { page_path: pathname });
  }, [pathname]);

  return null;
}
