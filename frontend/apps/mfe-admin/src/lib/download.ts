import { authStore } from '@ecommerce/auth';

/**
 * Tải file admin (SF-13 A7b CSV) qua authed fetch — header Bearer + refresh
 * single-flight của authStore.fetch; blob → a[download] theo filename trong
 * Content-Disposition (fallback tên truyền vào).
 */
export async function downloadAdminFile(path: string, fallbackName: string): Promise<void> {
  const res = await authStore.fetch(path);
  if (!res.ok) {
    throw new Error(`Tải file thất bại (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
