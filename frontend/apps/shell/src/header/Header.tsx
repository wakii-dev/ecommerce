import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { HeaderSlots } from './HeaderSlots';
import type { SlotKey } from './HeaderSlots';
import { Link } from '../router';

// Header chỉ RENDER slot lists — không hardcode widget nào của remote.
// Shell đăng ký nav mặc định từ main.tsx; remote đăng ký qua HeaderSlots
// sau khi được shell nạp (xem pages/RemotePage.tsx).

/** Nav mặc định của shell — đăng ký vào slot 'left' từ main.tsx bootstrap. */
export function ShellNav(): ReactElement {
  const { t } = useT();
  return (
    <Link to="/" aria-label={t('nav.home')}>
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
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-3, 12px)',
        padding: 'var(--space-3, 12px) var(--space-4, 16px)',
        borderBottom: '1px solid var(--c-border, #e5e7eb)'
      }}
      aria-label={t('nav.home')}
    >
      <Slot slot="left" />
      <Slot slot="center" />
      <Slot slot="right" />
    </header>
  );
}
