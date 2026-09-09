// AccountLayout (SF-4 FI-394 T1) — side-nav 6 mục bọc các trang đã đăng nhập.
// Pattern admin sidebar direction §2.5 (border-left 3px active tint) thu nhỏ
// cho storefront; <600px collapse thành nav ngang scroll-x. KHÔNG đoán active
// từ path — page tự truyền prop (single source); route GIỮ NGUYÊN, điều hướng
// qua appNavigate (giữ pattern các page — modifier-click cho qua mặc định).
import type { MouseEvent, ReactElement } from 'react';
import { Icon } from '@ecommerce/ui-kit';
import type { IconName } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { appNavigate } from './bootstrap';

export interface AccountNavItem {
  key: string;
  to: string;
  icon: IconName;
  labelKey: string;
}

export type AccountNavActive = 'account' | 'orders' | 'wishlist' | 'reviews' | 'affiliate' | 'loyalty';

/** Điểm thưởng không có route riêng → anchor #loyalty trên trang affiliate. */
export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  { key: 'account', to: '/account', icon: 'user', labelKey: 'account.nav.account' },
  { key: 'orders', to: '/account/orders', icon: 'package', labelKey: 'account.nav.orders' },
  { key: 'wishlist', to: '/account/wishlist', icon: 'heart', labelKey: 'account.nav.wishlist' },
  { key: 'reviews', to: '/account/reviews', icon: 'star', labelKey: 'account.nav.reviews' },
  { key: 'affiliate', to: '/account/affiliate', icon: 'external', labelKey: 'account.nav.affiliate' },
  { key: 'loyalty', to: '/account/affiliate#loyalty', icon: 'ticket', labelKey: 'account.nav.loyalty' }
];

/** Click thường → SPA navigate; ctrl/meta/shift/alt (tab mới/cửa sổ mới) → mặc định trình duyệt. */
function onNavClick(event: MouseEvent<HTMLAnchorElement>, to: string): void {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  appNavigate(to);
}

export function AccountLayout({
  active,
  children
}: {
  active: AccountNavActive;
  children: ReactElement;
}): ReactElement {
  const { t } = useT();
  return (
    <div className="acc-shell">
      <nav className="acc-nav" aria-label={t('account.nav.label')}>
        {ACCOUNT_NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <a
              key={item.key}
              href={item.to}
              className={isActive ? 'acc-nav__link acc-nav__link--active' : 'acc-nav__link'}
              aria-current={isActive ? 'page' : undefined}
              onClick={(event) => onNavClick(event, item.to)}
            >
              <Icon name={item.icon} size={18} />
              <span>{t(item.labelKey)}</span>
            </a>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
