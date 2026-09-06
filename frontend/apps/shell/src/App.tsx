import { lazy, Suspense, useReducer } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useT } from '@ecommerce/i18n';
import { Button, Card, EmptyState } from '@ecommerce/ui-kit';
import Header from './header/Header';
import ErrorBoundary from './ErrorBoundary';
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

/** Remote down / render crash → UI thay thế, KHÔNG trắng trang (P1-1 R3). */
function RemoteErrorFallback({ error }: { error: Error }): ReactElement {
  return (
    <Card>
      <EmptyState
        title="Remote không chạy"
        description={
          <>
            {error.message} — chạy{' '}
            <code>pnpm -C frontend --filter @ecommerce/skeleton-remote dev</code>
          </>
        }
        action={
          <Button onClick={() => window.location.reload()}>Thử lại</Button>
        }
      />
    </Card>
  );
}

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
      <ErrorBoundary fallback={(error) => <RemoteErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <RemotePage onRegistryChange={bumpRegistry} />
        </Suspense>
      </ErrorBoundary>
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
