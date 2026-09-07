'use client';

import { useEffect } from 'react';

/**
 * Register /sw.js (SF-15). CHỈ prod (next build+start) — dev skip để tránh
 * cache nóng phá hot-reload; e2e KHÔNG assert serviceWorker.ready (quyết định
 * Task 7 — SW active verify bằng prod build ở walkthrough T11).
 */
export default function PwaRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = (): void => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.warn('[pwa] register sw.js thất bại:', error);
      });
    };
    if (document.readyState === 'complete') onLoad();
    else {
      window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);
  return null;
}
