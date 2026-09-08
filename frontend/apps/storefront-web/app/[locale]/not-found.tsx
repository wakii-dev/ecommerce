import Link from 'next/link';

/**
 * 404 trong segment [locale] — render BÊN TRONG locale layout (Header/Footer
 * giữ nguyên). Dùng cho PDP/PLP slug không tồn tại (notFound() từ page).
 * Locale không xác định được ở đây (not-found không nhận params) → bilingual.
 */
export default function LocaleNotFound() {
  return (
    <div className="container not-found">
      <p className="not-found-code">404</p>
      <h1 className="not-found-title">Không tìm thấy trang</h1>
      <p className="not-found-desc">Page not found — Trang bạn tìm không tồn tại hoặc đã bị xóa.</p>
      <Link className="not-found-home" href="/">
        ← Trang chủ / Home
      </Link>
    </div>
  );
}
