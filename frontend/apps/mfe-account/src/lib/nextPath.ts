/**
 * Path đích sau login — đọc `?next=` từ query. CHỈ nhận local path bắt đầu
 * bằng '/' và không phải protocol-relative ('//evil.com') — chặn
 * open-redirect. Còn lại (thiếu/không hợp lệ) → fallback.
 */
export function safeNextPath(search: string, fallback: string): string {
  const raw = new URLSearchParams(search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}
