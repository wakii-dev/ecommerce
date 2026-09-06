import { lazy, Suspense, useReducer } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useT } from '@ecommerce/i18n';
import Header from './header/Header';
import Home from './pages/Home';
import UiKitDemoPage from './pages/UiKitDemoPage';
import { usePath } from './router';

// Remote page nạp LAZY — shell vẫn boot được khi remote down (import động chỉ
// chạy khi vào /skeleton); RemotePage mới là nơi import module federation.
const RemotePage = lazy(() => import('./pages/RemotePage'));

const mainStyle = {
  padding: 'var(--space-4, 16px)',
  maxWidth: 960,
  margin: '0 auto'
} as const;

export default function App(): ReactElement {
  const { t } = useT();
  const path = usePath();
  // Bump khi remote register/unregister widget vào header slot → Header
  // re-render đọc lại HeaderSlots.list (registry không có subscription —
  // tối giản cho harness).
  const [, bumpRegistry] = useReducer((count: number) => count + 1, 0);

  let page: ReactNode;
  if (path === '/skeleton') {
    page = (
      <Suspense fallback={<p>{t('common.loading')}</p>}>
        <RemotePage onRegistryChange={bumpRegistry} />
      </Suspense>
    );
  } else if (path === '/ui-kit') {
    page = <UiKitDemoPage />;
  } else {
    page = <Home />;
  }

  return (
    <>
      <Header />
      <main style={mainStyle}>{page}</main>
    </>
  );
}
