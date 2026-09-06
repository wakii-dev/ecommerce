/**
 * Bảng rewrite locale của middleware (SF-4 D16) — hàm THUẦN để unit test
 * được (Task 15: "middleware rewrite table — viết test cho hàm match nếu
 * tách được"). vi là mặc định KHÔNG prefix: URL giữ nguyên, Next render
 * route `/vi/...`; `/en/**` đi thẳng (không rewrite).
 *
 * Trả về path đích rewrite, hoặc null khi pass-through.
 */
export function rewriteTarget(pathname: string): string | null {
  if (pathname === '/') return '/vi';
  if (pathname === '/search') return '/vi/search';
  if (pathname === '/coupons') return '/vi/coupons';
  if (pathname === '/c' || pathname.startsWith('/c/')) return `/vi${pathname}`;
  if (pathname === '/p' || pathname.startsWith('/p/')) return `/vi${pathname}`;
  return null;
}
