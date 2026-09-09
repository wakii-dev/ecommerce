'use client';

import type { ComponentType, ReactElement, ReactNode } from 'react';
import { useT } from '@ecommerce/i18n';
import { HeaderSlots } from './header-slots';
import type { SlotKey } from './header-slots';

/**
 * SiteHeader SSR-able (FI-398 T4, spec §3.2) — 1 nguồn duy nhất cho host +
 * remote. 'use client' P0-critic: useT() = react-i18next hook — RSC thuần
 * CRASH; client component vẫn được Next server-render HTML đầu → links trong
 * HTML giữ nguyên SEO/nav-honesty. SSR contract: renderToStaticMarkup sạch,
 * không window/matchMedia lúc render (host bọc I18nextProvider — SF-4 wire).
 *
 * Merge order (P2 critic chốt): row1 = props.slots[slot] TRƯỚC, registry
 * HeaderSlots.list(slot) SAU. Server render registry rỗng → chỉ props links
 * (deterministic). row2 = node thuần qua props (shell truyền <ShellMiniNav/>).
 *
 * DOM/class giữ anatomy FI-393 T2: row1 = 3 slot div data-slot
 * left|center|right (flex inline như Slot cũ của shell), row2 optional.
 * Không props-label — aria/labels qua useT() keys chrome.header.*.
 */
export interface SiteHeaderProps {
  row2?: ReactNode;
  slots?: Partial<Record<SlotKey, ComponentType[]>>;
  className?: string;
}

/** Nội dung 1 slot — merge props TRƯỚC registry SAU (deterministic). */
function SlotContent({ slot, injected }: { slot: SlotKey; injected?: ComponentType[] }): ReactElement {
  const components = [...(injected ?? []), ...HeaderSlots.list(slot)];
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

export function SiteHeader({ row2, slots, className }: SiteHeaderProps): ReactElement {
  const { t } = useT();
  return (
    <header
      className={'chrome-header' + (className ? ' ' + className : '')}
      aria-label={t('chrome.header.aria')}
    >
      <div className="chrome-header__row1">
        <SlotContent slot="left" injected={slots?.left} />
        <SlotContent slot="center" injected={slots?.center} />
        <SlotContent slot="right" injected={slots?.right} />
      </div>
      {row2 ? <div className="chrome-header__row2">{row2}</div> : null}
    </header>
  );
}

export default SiteHeader;
