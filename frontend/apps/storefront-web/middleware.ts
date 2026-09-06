import { NextResponse, type NextRequest } from 'next/server';

import { rewriteTarget } from './lib/locale-rewrite';

/**
 * Locale routing (plan Task 10): `/`, `/c/**`, `/p/**`, `/search`, `/coupons`
 * rewrite sang `/vi/...` (NextResponse.rewrite — URL trên browser KHÔNG đổi);
 * `/en`, `/en/**`, `/vi/**` pass-through. Query string (?q=, ?page=) được giữ
 * nguyên qua `nextUrl.clone()`.
 */
export function middleware(request: NextRequest) {
  const target = rewriteTarget(request.nextUrl.pathname);
  // SF-8: locale resolve cho <html lang> ở root app/layout.tsx (không thấy
  // params segment) — segment /en hoặc path rewrite vi.
  const locale = resolveHeaderLocale(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  if (locale) requestHeaders.set('x-app-locale', locale);

  if (target === null) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (locale) response.headers.set('x-app-locale', locale);
    return response;
  }
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  });
}

/** Locale cho header: /en/** → en; còn lại (path thường rewrite vi hoặc /vi/**) → vi. */
function resolveHeaderLocale(pathname: string): string | null {
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  if (pathname === '/vi' || pathname.startsWith('/vi/')) return 'vi';
  if (pathname === '/' || pathname.startsWith('/c') || pathname.startsWith('/p')
    || pathname.startsWith('/search') || pathname.startsWith('/coupons')) return 'vi';
  return null;
}

export const config = {
  // Loại trừ asset tĩnh + API proxy (rewrites của next.config chạy riêng) —
  // plan Task 10 matcher: `/_next|favicon|robots.txt|sitemap.xml|api`.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api).*)'],
};
