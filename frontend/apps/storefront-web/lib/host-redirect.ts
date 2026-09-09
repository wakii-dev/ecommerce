/**
 * SF-2 FI-399 — host 127.0.0.1 phải về `localhost`: refresh cookie host-scoped,
 * 2 hostname = 2 cookie jar = session sync vỡ. Chỉ 127.0.0.1 trigger (localhost
 * không khớp → không loop). IPv6 [::1] ngoài scope (browser không tự dùng).
 */
export function redirectHost127(hostname: string): 'localhost' | null {
  return hostname === '127.0.0.1' ? 'localhost' : null;
}

/**
 * Hostname từ Host header (vd `127.0.0.1:3400` → `127.0.0.1`, `[::1]:3000` →
 * `[::1]`). Middleware PHẢI dùng header này thay vì `nextUrl.hostname` — Next
 * normalize nextUrl theo BIND address (vd `0.0.0.0` với `next dev -H 0.0.0.0`),
 * không phải host client dùng (cookie jar theo host client nhìn thấy).
 * Header thiếu/sai format → rỗng (không redirect).
 */
export function hostnameFromHostHeader(host: string | null): string {
  if (!host || host.includes('@')) return ''; // '@' = userinfo smuggling (P2-2 security-audit)
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return '';
  }
}
