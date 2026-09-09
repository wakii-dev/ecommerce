import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { sfUrl } from './ShellSearch';

/**
 * Mini-nav hàng 2 của shell header (FI-393 T2) — 3 link danh mục như
 * storefront (SF-2). <a> THẬT cross-origin (full navigation tới storefront —
 * KHÔNG SPA navigate, KHÔNG qua router Link). Shell-owned: Header.tsx render
 * TRỰC TIẾP trong row2 — KHÔNG qua HeaderSlots registry (không phải remote
 * widget; registry contract left|center|right giữ nguyên).
 */
export default function ShellMiniNav(): ReactElement {
  const { t } = useT();
  const base = sfUrl();
  return (
    <nav className="shell-mininav" aria-label={t('shell.mininav.categories')}>
      <div className="shell-mininav__inner">
        <a href={`${base}/c/dien-tu`}>{t('shell.mininav.categories')}</a>
        <a className="accent" href={`${base}/c/dien-tu?sort=newest`}>
          {t('shell.mininav.new')}
        </a>
        <a className="accent" href={`${base}/c/dien-tu?sort=rating`}>
          {t('shell.mininav.best')}
        </a>
      </div>
    </nav>
  );
}
