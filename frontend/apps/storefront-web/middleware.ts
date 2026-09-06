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
  if (target === null) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  // Loại trừ asset tĩnh + API proxy (rewrites của next.config chạy riêng) —
  // plan Task 10 matcher: `/_next|favicon|robots.txt|sitemap.xml|api`.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api).*)'],
};
