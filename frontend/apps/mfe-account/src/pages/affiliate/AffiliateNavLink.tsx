// pages/affiliate/AffiliateNavLink.tsx — widget đăng ký vào header slot (slot
// registry: remote đăng ký widget TỪ app của mình, không sửa Header của shell —
// pattern OrdersNavLink SF-9; SF-12 slice). Chỉ hiện khi đã đăng nhập.
import type { ReactElement } from 'react';
import { useAuth } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { appNavigate } from '../../bootstrap';

export default function AffiliateNavLink(): ReactElement | null {
  const { user } = useAuth();
  const { t } = useT();
  if (!user) return null;
  return (
    <a
      href="/account/affiliate"
      data-testid="affiliate-nav-link"
      onClick={(event) => {
        event.preventDefault();
        appNavigate('/account/affiliate');
      }}
      style={{
        color: 'var(--c-text, #212121)',
        fontSize: 'var(--text-md, 14px)',
        textDecoration: 'none'
      }}
    >
      {t('account.nav.affiliate')}
    </a>
  );
}
