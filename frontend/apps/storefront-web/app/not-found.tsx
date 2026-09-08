import Link from 'next/link';

/**
 * 404 ROOT — locale không hợp lệ (/fr/...) khi [locale]/layout tự notFound().
 * Không có root layout riêng (html/body sống ở [locale]/layout theo pattern
 * i18n) — Next render not-found này với html mặc định của nó.
 */
export default function RootNotFound() {
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
