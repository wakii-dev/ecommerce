import { lazy, Suspense, useEffect, useReducer } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useT } from '@ecommerce/i18n';
import { AuthProvider } from '@ecommerce/auth';
import { Button, Card, EmptyState } from '@ecommerce/ui-kit';
import Header from './header/Header';
import ErrorBoundary from './ErrorBoundary';
import Home from './pages/Home';
import UiKitDemoPage from './pages/UiKitDemoPage';
import { usePath } from './router';

// Remote page nạp LAZY — shell vẫn boot được khi remote down (import động chỉ
// chạy khi vào /skeleton); RemotePage mới là nơi import module federation.
const RemotePage = lazy(() => import('./pages/RemotePage'));

// Trang auth/profile của mfe-account (SF-3) — cũng LAZY, cùng lý do: shell
// vẫn boot khi remote down; ErrorBoundary thay trang bằng hướng dẫn chạy remote.
const AccountLoginPage = lazy(() => import('account/LoginPage'));
const AccountRegisterPage = lazy(() => import('account/RegisterPage'));
const AccountPage = lazy(() => import('account/AccountPage'));
// SF-15 (FI-325): oauth callback (302 từ identity về shell origin).
const AccountOAuthCallbackPage = lazy(() => import('account/OAuthCallbackPage'));
// SF-15: trang nhập mã sau login challenge (2FA).
const AccountTwoFactorPage = lazy(() => import('account/TwoFactorPage'));
// SF-9 (FI-319) — my-orders slice mfe-account (pages/orders/*) — LAZY như các page trên.
const AccountOrdersPage = lazy(() => import('account/OrdersPage'));
const AccountOrderDetailPage = lazy(() => import('account/OrderDetailPage'));
// SF-8: wishlist + my-reviews của mfe-account — cùng pattern lazy + fallback.
const WishlistPage = lazy(() => import('account/WishlistPage'));
const MyReviewsPage = lazy(() => import('account/MyReviewsPage'));
// SF-12 (FI-322): affiliate dashboard của mfe-account (pages/affiliate/*).
const AffiliatePage = lazy(() => import('account/AffiliatePage'));

// Trang cart/checkout của mfe-checkout (SF-6) — LAZY + fallback pattern account.
const CheckoutCartPage = lazy(() => import('checkout/CartPage'));
const CheckoutPage = lazy(() => import('checkout/CheckoutPage'));
const CheckoutConfirmationPage = lazy(() => import('checkout/ConfirmationPage'));

// Khu quản trị mfe-admin (SF-7) — LAZY như các remote khác.
const AdminApp = lazy(() => import('admin/AdminApp'));

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

/** Fallback cho các trang mfe-account (SF-3) — cùng pattern RemoteErrorFallback. */
function AccountErrorFallback({ error }: { error: Error }): ReactElement {
  return (
    <Card>
      <EmptyState
        title="mfe-account không chạy"
        description={
          <>
            {error.message} — chạy{' '}
            <code>pnpm -C frontend --filter @ecommerce/mfe-account dev</code>
          </>
        }
        action={
          <Button onClick={() => window.location.reload()}>Thử lại</Button>
        }
      />
    </Card>
  );
}

/** Fallback cho khu quản trị mfe-admin (SF-7) — cùng pattern account. */
function AdminErrorFallback({ error }: { error: Error }): ReactElement {
  return (
    <Card>
      <EmptyState
        title="mfe-admin không chạy"
        description={
          <>
            {error.message} — chạy{' '}
            <code>pnpm -C frontend --filter @ecommerce/mfe-admin dev</code>
          </>
        }
        action={
          <Button onClick={() => window.location.reload()}>Thử lại</Button>
        }
      />
    </Card>
  );
}



/** Fallback cho các trang mfe-checkout (SF-6) — cùng pattern. */
function CheckoutErrorFallback({ error }: { error: Error }): ReactElement {
  return (
    <Card>
      <EmptyState
        title="mfe-checkout không chạy"
        description={
          <>
            {error.message} — chạy{' '}
            <code>pnpm -C frontend --filter @ecommerce/mfe-checkout dev</code>
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

  // mfe-account bootstrap (main.tsx) truyền onRegistryChange dispatch event này
  // khi widget auth của remote vào header → bump để Header đọc lại registry.
  useEffect(() => {
    const bump = (): void => bumpRegistry();
    window.addEventListener('ecommerce:header-slots-changed', bump);
    return () => window.removeEventListener('ecommerce:header-slots-changed', bump);
  }, [bumpRegistry]);

  let page: ReactNode;
  // mfe-admin (SF-7) — full-bleed NGOÀI <main maxWidth:960> (admin layout có
  // sidebar riêng, cần trọn bề ngang); shell Header vẫn giữ cho auth widget.
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  if (isAdmin) {
    page = (
      <ErrorBoundary fallback={(error) => <AdminErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <AdminApp />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/skeleton') {
    page = (
      <ErrorBoundary fallback={(error) => <RemoteErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <RemotePage onRegistryChange={bumpRegistry} />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/ui-kit') {
    page = <UiKitDemoPage />;
  } else if (path === '/login/oauth/callback') {
    // SF-15: identity 302 về đây kèm ?code một-lần — route TRƯỚC /login.
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <AccountOAuthCallbackPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/login/2fa') {
    // SF-15: nhập mã TOTP/backup sau khi password đúng (challenge trong session).
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <AccountTwoFactorPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/login') {
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <AccountLoginPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/register') {
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <AccountRegisterPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/account') {
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <AccountPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/account/orders' || path.startsWith('/account/orders/')) {
    // SF-9 — my-orders: list + detail (id là segment cuối; segment lạ → detail tự 404)
    const orderId = path.split('/')[3];
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          {orderId ? <AccountOrderDetailPage id={orderId} /> : <AccountOrdersPage />}
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/account/wishlist') {
    // SF-8: wishlist page (mfe-account slice)
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <WishlistPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/account/reviews') {
    // SF-8: my-reviews page (mfe-account slice)
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <MyReviewsPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/account/affiliate') {
    // SF-12: affiliate dashboard page (mfe-account slice)
    page = (
      <ErrorBoundary fallback={(error) => <AccountErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <AffiliatePage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/cart') {
    page = (
      <ErrorBoundary fallback={(error) => <CheckoutErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <CheckoutCartPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/checkout') {
    page = (
      <ErrorBoundary fallback={(error) => <CheckoutErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <CheckoutPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else if (path === '/order/confirmation') {
    page = (
      <ErrorBoundary fallback={(error) => <CheckoutErrorFallback error={error} />}>
        <Suspense fallback={<p>{t('common.loading')}</p>}>
          <CheckoutConfirmationPage />
        </Suspense>
      </ErrorBoundary>
    );
  } else {
    page = <Home />;
  }

  // AuthProvider bao TOÀN app — useAuth() trong widget/page của remote đọc cùng
  // context này (singleton federation: remote dùng chung bản @ecommerce/auth).
  if (isAdmin) {
    return (
      <AuthProvider>
        <Header />
        {page}
      </AuthProvider>
    );
  }
  return (
    <AuthProvider>
      <Header />
      <main style={mainStyle}>{page}</main>
    </AuthProvider>
  );
}
