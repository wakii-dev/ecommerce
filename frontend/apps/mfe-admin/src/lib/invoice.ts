// lib/invoice.ts — hóa đơn MOCK (D18: invoice-service là SF-9, live ở SF-10).
// Stub tạo Blob "PDF" placeholder đủ để chứng minh action shape download;
// bytes thật (layout HĐ VN + VAT) sẽ đến từ ordering/admin invoice endpoint.

export function invoiceBlob(orderId: string): Blob {
  const content = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj',
    'trailer << /Root 1 0 R >>',
    `%% Hoad don demo (mock) — don hang ${orderId}`,
    '%% SF-9 invoice-service se thay bang PDF that (mau HD VN, VAT breakdown).',
    '%%EOF',
    ''
  ].join('\n');
  return new Blob([content], { type: 'application/pdf' });
}

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
