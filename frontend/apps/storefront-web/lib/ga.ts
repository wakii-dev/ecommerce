/** GA4 loader dùng chung (SF-13 A7a) — KHÔNG có ID → không load gì cả. */

interface GtagWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || '';

/** Đặt gtag stub + nạp script gtag.js — gọi 1 lần từ layout khi GA_ID != ''. */
export function loadGtagScript(id: string): void {
  if (!id) return;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag(...args: unknown[]) {
    w.dataLayer!.push(args);
  };
  w.gtag('js', new Date());
  w.gtag('config', id);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);
}

/** Bắn event nếu gtag sẵn sàng (purchase...); im lặng khi GA chưa load. */
export function gaEvent(action: string, params: Record<string, unknown>): void {
  const gtag = (window as GtagWindow).gtag;
  gtag?.('event', action, params);
}
