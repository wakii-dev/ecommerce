import Link from 'next/link';

import { Icon } from '../components/ui-kit';

/**
 * 404 ROOT — locale không hợp lệ (/fr/...) khi [locale]/layout tự notFound().
 * Không có root layout riêng (html/body sống ở [locale]/layout theo pattern
 * i18n) — Next render not-found này với html mặc định của nó.
 * Elevation FI-392 T2: icon search + CTA outline (css .not-found-*).
 */
export default function RootNotFound() {
  return (
    <div className="container not-found">
      <span className="not-found-icon" aria-hidden="true">
        <Icon name="search" size={30} />
      </span>
      <p className="not-found-code">404</p>
      <h1 className="not-found-title">Không tìm thấy trang</h1>
      <p className="not-found-desc">Page not found — Trang bạn tìm không tồn tại hoặc đã bị xóa.</p>
      <Link className="not-found-home" href="/">
        ← Trang chủ / Home
      </Link>
    </div>
  );
}
