/**
 * SF-2 FI-399 — host 127.0.0.1 phải về `localhost`: refresh cookie host-scoped,
 * 2 hostname = 2 cookie jar = session sync vỡ. Chỉ 127.0.0.1 trigger (localhost
 * không khớp → không loop). IPv6 [::1] ngoài scope (browser không tự dùng).
 */
export function redirectHost127(hostname: string): 'localhost' | null {
  return hostname === '127.0.0.1' ? 'localhost' : null;
}
