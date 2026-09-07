/**
 * GA4 cho shell (SF-13 A7a) — VITE_GA_ID có → nạp gtag.js + pageview theo
 * usePath; KHÔNG có ID → không load gì. Dùng chung window.gtag với các remote
 * (mfe-checkout bắn purchase trên confirmation — guard typeof mọi nơi).
 */

interface GtagWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

export const GA_ID: string = (import.meta.env.VITE_GA_ID as string | undefined) ?? '';

export function initGa(): void {
  if (!GA_ID) return;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag(...args: unknown[]) {
    w.dataLayer!.push(args);
  };
  w.gtag('js', new Date());
  w.gtag('config', GA_ID);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
}

export function gaPageview(path: string): void {
  if (!GA_ID) return;
  const gtag = (window as GtagWindow).gtag;
  gtag?.('event', 'page_view', { page_path: path });
}
