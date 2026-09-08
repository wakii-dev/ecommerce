'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Tabs } from '../ui-kit';

/**
 * PDP tabs (plan T8b): primitive `Tabs` (role=tab button + keyboard ←→
 * roving tabindex) thay nav anchor CSS :target — panel cùng cụm panel cũ
 * vẫn nằm sẵn trong HTML SSR, ẩn/hiện qua attribute `hidden` (no-JS: panel
 * đầu hiện, tab switching là enhancement).
 *
 * Hash sync: mount đọc location.hash + nghe `hashchange` — hash khớp
 * `#tab-desc|info|reviews` → activate tab đó (deep-link/meta "N đánh giá"
 * href=#tab-reviews đều vào được đúng tab); hash rỗng/không khớp → ignore
 * giữ state (browser back không nhảy tab). Scroll vào panel có
 * scroll-margin-top (css) để không bị sticky header che đỉnh.
 *
 * aria: panel giữ id thật (tab-desc/info/reviews — anchor target) +
 * role=tabpanel + aria-labelledby trỏ id nút tab của primitive
 * (`uk-tab-${key}`). Note: nút tab của primitive khai báo aria-controls
 * `uk-tab-panel-*` (panel wrapper của nó) — panel thật ở đây mang id riêng
 * để giữ anchor contract; trade-off chấp nhận (PdpTabs là consumer duy nhất
 * của pattern này).
 */

const TAB_KEYS = ['tab-desc', 'tab-info', 'tab-reviews'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}

interface PdpTabsProps {
  labels: { desc: string; info: string; reviews: string };
  /** Nội dung 3 panel (RSC slot — page server render truyền vào). */
  desc: ReactNode;
  info: ReactNode;
  reviews: ReactNode;
}

export default function PdpTabs({ labels, desc, info, reviews }: PdpTabsProps) {
  const [activeKey, setActiveKey] = useState<TabKey>('tab-desc');

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.slice(1);
      if (isTabKey(hash)) setActiveKey(hash);
      // hash rỗng/không khớp → ignore (giữ tab hiện tại)
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const panels: Array<{ key: TabKey; label: string; content: ReactNode }> = [
    { key: 'tab-desc', label: labels.desc, content: desc },
    { key: 'tab-info', label: labels.info, content: info },
    { key: 'tab-reviews', label: labels.reviews, content: reviews },
  ];

  return (
    <div className="pdp-tabs">
      <Tabs
        items={panels.map((panel) => ({ key: panel.key, label: panel.label }))}
        value={activeKey}
        onInput={(key) => {
          if (isTabKey(key)) setActiveKey(key);
        }}
      />
      {panels.map((panel) => (
        <section
          key={panel.key}
          id={panel.key}
          className="pdp-panel"
          role="tabpanel"
          aria-labelledby={`uk-tab-${panel.key}`}
          hidden={activeKey !== panel.key}
        >
          {panel.content}
        </section>
      ))}
    </div>
  );
}
