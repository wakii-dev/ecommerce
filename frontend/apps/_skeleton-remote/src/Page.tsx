import React from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { Button } from '@ecommerce/ui-kit';

// Chip kiểm chứng singleton (plan Task 14): shell gắn window.__shellReact__
// TRƯỚC khi remote được nạp — nếu shared singleton hoạt động, `React` ở đây
// (import của remote) là CÙNG instance với shell → ✓. `window` chỉ đọc trong
// component (D16 framework-portable).
export default function Page(): ReactElement {
  const { t } = useT();
  const sameReact = (window as any).__shellReact__ === React;
  const user = authStore.getUser();

  return (
    <section data-testid="skeleton-page">
      <h1>skeleton/Page — từ remote qua Module Federation</h1>
      <p>
        <span data-testid="react-singleton">
          {sameReact ? 'REACT ✓ 1 INSTANCE' : 'REACT ✗ DUPLICATE'}
        </span>
      </p>
      <p data-testid="auth-state">
        auth (authStore singleton xuyên boundary):{' '}
        {authStore.isAuthenticated()
          ? `đã đăng nhập${user ? ` — ${user.id}${user.roles.length > 0 ? ` · roles: ${user.roles.join(', ')}` : ''}` : ''}`
          : 'khách (chưa đăng nhập)'}
      </p>
      <p>{t('common.loading')} — i18next dùng chung instance với shell.</p>
      <p>
        <Button variant="secondary">Button từ @ecommerce/ui-kit (shared singleton)</Button>
      </p>
    </section>
  );
}
