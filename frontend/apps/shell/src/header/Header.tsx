import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { HeaderSlots } from './HeaderSlots';
import type { SlotKey } from './HeaderSlots';
import { Link } from '../router';
import ShellMiniNav from './ShellMiniNav';

// Header chỉ RENDER slot lists — không hardcode widget nào của remote.
// Shell đăng ký nav mặc định từ main.tsx; remote đăng ký qua HeaderSlots
// sau khi được shell nạp (xem pages/RemotePage.tsx).
// FI-393 T2: anatomy 2 hàng (direction §2.1) — row1 = Slot left|center|right
// (registry contract KHÔNG đổi — CartBadge/AuthWidget đăng ký 'right',
// ShellSearch shell đăng ký 'center'), row2 = ShellMiniNav shell-owned render
// TRỰC TIẾP (không qua registry — không phải remote widget).

/** Nav mặc định của shell — đăng ký vào slot 'left' từ main.tsx bootstrap. */
export function ShellNav(): ReactElement {
  const { t } = useT();
  return (
    <Link to="/" className="shell-logo" aria-label={t('nav.home')}>
      <strong>ecommerce</strong>
    </Link>
  );
}

function Slot({ slot }: { slot: SlotKey }): ReactElement {
  const components = HeaderSlots.list(slot);
  return (
    <div
      data-slot={slot}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)' }}
    >
      {components.map((Component, index) => (
        <Component key={index} />
      ))}
    </div>
  );
}

export default function Header(): ReactElement {
  const { t } = useT();
  return (
    <header className="shell-header" aria-label={t('nav.home')}>
      <div className="shell-header__row1">
        <Slot slot="left" />
        <Slot slot="center" />
        <Slot slot="right" />
      </div>
      <div className="shell-header__row2">
        <ShellMiniNav />
      </div>
    </header>
  );
}
