import { Button, EmptyState, Icon } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import type { ReactElement } from 'react';
import { appNavigate } from '../bootstrap';

/** Trang 403 cho customer vào /admin — guard UI chỉ UX, server vẫn là gateway. */
export default function ForbiddenPage(): ReactElement {
  const { t } = useT();
  return (
    <div className="admin-guard">
      <EmptyState
        icon={
          <span className="admin-guard__icon" aria-hidden="true">
            <Icon name="alert" size={28} />
          </span>
        }
        title={t('admin.guard.forbiddenTitle')}
        description={t('admin.guard.forbiddenDesc')}
        action={<Button onClick={() => appNavigate('/')}>{t('admin.guard.backHome')}</Button>}
      />
    </div>
  );
}
