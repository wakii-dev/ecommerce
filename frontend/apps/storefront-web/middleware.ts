import { NextResponse, type NextRequest } from 'next/server';

import { rewriteTarget } from './lib/locale-rewrite';
import {
  nextAffiliateCookieAction,
  type CaptureResult,
} from './lib/affiliate-cookie';

/**
 * Locale routing (plan Task 10): `/`, `/c/**`, `/p/**`, `/search`, `/coupons`
 * rewrite sang `/vi/...` (NextResponse.rewrite — URL trên browser KHÔNG đổi);
 * `/en`, `/en/**`, `/vi/**` pass-through. Query string (?q=, ?page=) được giữ
 * nguyên qua `nextUrl.clone()`.
 *
 * SF-12 (FI-322): capture link affiliate `?ref=CODE` — gọi POST
 * /api/affiliate/track/click server-side (affiliate-service ghi click +
 * trả Set-Cookie `aff_ref` 30 ngày — cookie window do service quản theo
 * contract), forward cookie về browser và REDIRECT 307 bỏ `?ref` (URL sạch
 * SEO — rewrite không đổi address bar). Gateway chết → vẫn vào trang bình
 * thường, GIỮ attribution cũ (không clear vì lỗi tạm thời). Click dedupe
 * 1/IP/10' do service lo.
 */
export async function middleware(request: NextRequest) {
  const target = rewriteTarget(request.nextUrl.pathname);
  // SF-8: locale resolve cho <html lang> ở root app/layout.tsx (không thấy
  // params segment) — segment /en hoặc path rewrite vi.
  const locale = resolveHeaderLocale(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  if (locale) requestHeaders.set('x-app-locale', locale);

  // SF-12: ?ref trên BẤT KỲ path nào → track + REDIRECT về URL sạch (hop
  // thứ 2 không ref → đi đường rewrite locale bình thường)
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref !== null) {
    const capture = await captureRef(ref, request);
    const clean = request.nextUrl.clone();
    clean.searchParams.delete('ref');
    const redirect = NextResponse.redirect(clean, 307);
    const decision = nextAffiliateCookieAction(capture, Boolean(request.cookies.get('aff_ref')));
    if (decision.action === 'set') {
      redirect.cookies.set(decision.plan.name, decision.plan.value, {
        httpOnly: decision.plan.httpOnly,
        path: decision.plan.path,
        sameSite: decision.plan.sameSite,
        ...(decision.plan.maxAge !== undefined ? { maxAge: decision.plan.maxAge } : {}),
      });
    } else if (decision.action === 'clear') {
      // service trả 204 KHÔNG cookie (code sai/SUSPENDED) → xoá attribution cũ
      redirect.cookies.set('aff_ref', '', { httpOnly: false, path: '/', maxAge: 0 });
    }
    return redirect;
  }

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

/**
 * Gọi affiliate-service track click — tri-state (review P1-1):
 * - 'set'    → service trả Set-Cookie (code APPROVED) → forward lên browser
 * - 'absent' → service trả 204 KHÔNG cookie (code sai/SUSPENDED) → clear cũ
 * - 'error'  → gateway chết/timeout → KHÔNG đụng cookie hiện có
 */
async function captureRef(refCode: string, request: NextRequest): Promise<CaptureResult> {
  const gateway = process.env.GATEWAY_URL || 'http://localhost:8080';
  try {
    const res = await fetch(`${gateway}/api/affiliate/track/click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // IP client forward để affiliate-service dedupe click 1/IP/10'
        'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
        'User-Agent': request.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify({ refCode }),
      signal: AbortSignal.timeout(3000), // không treo page vì affiliate
    });
    if (res.status !== 204 && !res.ok) return { kind: 'error' };
    const setCookie = res.headers.get('set-cookie');
    return setCookie ? { kind: 'set', setCookie } : { kind: 'absent' };
  } catch {
    return { kind: 'error' }; // gateway chết — vào trang bình thường, giữ attribution
  }
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
