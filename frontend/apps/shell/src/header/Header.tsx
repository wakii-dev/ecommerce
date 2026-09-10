import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { SiteHeader } from '@ecommerce/chrome';
import { Link } from '../router';
import ShellMiniNav from './ShellMiniNav';

// Header adapter (FI-398 T4 — FINAL STATE, SF-4 không đụng): mỏng — render
// chrome SiteHeader, shell chỉ giữ shell-owned mảnh: ShellNav (router Link +
// .shell-logo, đăng ký slot 'left' từ main.tsx) + row2 ShellMiniNav (render
// TRỰC TIẾP, không qua registry — không phải remote widget).
// Slot/merge logic đã về chrome (props TRƯỚC, registry SAU — spec §3.2);
// shell vẫn đăng ký ShellNav/ShellSearch/ThemeToggle từ main.tsx như cũ.
// Registry đổi → App.tsx dispatch HEADER_SLOTS_CHANGED_EVENT (chrome) bump
// re-render Header. Header KHÔNG hardcode widget nào của remote.

/** Nav mặc định của shell — đăng ký vào slot 'left' từ main.tsx bootstrap.
 * Logo Wakii hướng B "Túi W" (docs/design/logo-wakii-final — SVG wordmark
 * outline): 2 img light/dark swap theo data-theme trên <html> (css .shell-logo-img--*). */
export function ShellNav(): ReactElement {
  const { t } = useT();
  return (
    <Link to="/" className="shell-logo" aria-label={t('nav.home')}>
      <img
        className="shell-logo-img shell-logo-img--light"
        src="/logo-horizontal-light.svg"
        alt="Wakii store"
        height={26}
        width={107}
      />
      <img
        className="shell-logo-img shell-logo-img--dark"
        src="/logo-horizontal-dark.svg"
        alt="Wakii store"
        height={26}
        width={107}
      />
    </Link>
  );
}

export default function Header(): ReactElement {
  return <SiteHeader row2={<ShellMiniNav />} />;
}
