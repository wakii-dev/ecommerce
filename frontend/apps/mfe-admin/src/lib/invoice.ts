// lib/invoice.ts — hóa đơn LIVE (SF-10, D18): byte[] PDF thật từ ordering
// admin endpoint GET /api/ordering/admin/orders/{id}/invoice (bearer admin,
// authStore.fetch tự refresh khi 401). 409 khi đơn chưa CONFIRMED.
import { authStore } from '@ecommerce/auth';

/** Trigger download trình duyệt (client-only — chỉ gọi trong event handler). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Tải hóa đơn PDF thật — ném Error với detail từ problem+json khi lỗi. */
export async function downloadAdminInvoice(orderId: string): Promise<string> {
  const res = await authStore.fetch(`/api/ordering/admin/orders/${orderId}/invoice`);
  if (!res.ok) {
    let detail = `Tải hóa đơn lỗi (HTTP ${res.status})`;
    try {
      const problem = (await res.json()) as { detail?: string };
      if (problem.detail) detail = problem.detail;
    } catch {
      // body không phải json — giữ detail mặc định
    }
    throw new Error(detail);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const blob = await res.blob();
  downloadBlob(blob, match?.[1] ?? `hoa-don-${orderId}.pdf`);
  return match?.[1] ?? `hoa-don-${orderId}.pdf`;
}
