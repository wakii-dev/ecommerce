import { useEffect, useRef, useState } from 'react';
import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react';
import { authStore, configureAuth, logout, useAuth } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { Button, EmptyState, ToastProvider } from '@ecommerce/ui-kit';
import { appNavigate, hasShellNavigate } from './bootstrap';
import {
  ADMIN_NAV,
  activeNavIndex,
  resolveAdminRoute,
  resolveGuardState,
  type AdminGuardState,
  type AdminRoute
} from './lib/guard';
import CategoriesPage from './pages/CategoriesPage';
import CouponsPage from './pages/CouponsPage';
import DashboardPage from './pages/DashboardPage';
import ForbiddenPage from './pages/ForbiddenPage';
import OrderDetailPage from './pages/OrderDetailPage';
import OrdersPage from './pages/OrdersPage';
import ProductFormPage from './pages/ProductFormPage';
import ProductsListPage from './pages/ProductsListPage';
import ReviewsPage from './pages/ReviewsPage';

const STOREFRONT_URL: string =
  (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:3000';

function renderPage(route: AdminRoute, t: (key: string) => string): ReactElement {
  switch (route.page) {
    case 'dashboard':
      return <DashboardPage />;
    case 'products':
      return <ProductsListPage />;
    case 'product-new':
      return <ProductFormPage />;
    case 'product-edit':
      return <ProductFormPage id={route.id} />;
    case 'categories':
      return <CategoriesPage />;
    case 'coupons':
      return <CouponsPage />;
    case 'reviews':
      return <ReviewsPage />;
    case 'orders':
      return <OrdersPage />;
    case 'order-detail':
      return <OrderDetailPage id={route.id ?? ''} />;
    default:
      return <EmptyState icon="🧭" title={t('admin.common.notFound')} />;
  }
}

/** Shell layout — sidebar nav + topbar (user/storefront/logout). AdminApp con. */
function AdminShell({ path }: { path: string }): ReactElement {
  const { t } = useT();
  const { user, logout: clearLocal } = useAuth();
  const route = resolveAdminRoute(path);
  const active = activeNavIndex(path);

  const onNavClick = (event: ReactMouseEvent<HTMLAnchorElement>, to: string): void => {
    // Giữ open-in-new-tab cho modifier click (giống pattern Link của shell).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    appNavigate(to);
  };

  const onLogout = (): void => {
    void logout()
      .catch(() => undefined)
      .then(clearLocal)
      .then(() => appNavigate('/login'));
  };

  return (
    <div className="admin-root">
      <aside className="admin-side">
        <div className="admin-side__brand">
          ecommerce <span className="admin-side__badge">{t('nav.admin')}</span>
        </div>
        <nav className="admin-side__nav" aria-label={t('nav.admin')}>
          {ADMIN_NAV.map((item, i) => (
            <a
              key={item.to}
              href={item.to}
              className={i === active ? 'admin-nav-link admin-nav-link--active' : 'admin-nav-link'}
              aria-current={i === active ? 'page' : undefined}
              onClick={(e) => onNavClick(e, item.to)}
            >
              {t(item.key)}
            </a>
          ))}
        </nav>
      </aside>
      <div className="admin-body">
        <header className="admin-topbar">
          <div className="admin-topbar__user" data-testid="admin-user">
            {user?.fullName || user?.email || user?.id}
          </div>
          <div className="admin-topbar__actions">
            <a className="admin-topbar__store" href={STOREFRONT_URL} target="_blank" rel="noreferrer">
              {t('admin.topbar.viewStorefront')}
            </a>
            <Button variant="ghost" onClick={onLogout}>
              {t('admin.topbar.logout')}
            </Button>
          </div>
        </header>
        <main className="admin-content">{renderPage(route, t)}</main>
      </div>
    </div>
  );
}

/**
 * Khu quản trị — RBAC guard UX (server-side vẫn là gateway/identity):
 * booting (refresh settle) → guest (redirect login trong shell / hướng dẫn
 * standalone) | forbidden (403) | ok (layout). Theme `admin` chỉ sống khi
 * mount — unmount restore theme trước đó.
 */
export default function AdminApp(): ReactElement {
  const { t } = useT();
  const [state, setState] = useState<AdminGuardState | 'booting'>('booting');
  const [path, setPath] = useState<string>(() => window.location.pathname);
  const prevTheme = useRef<string>('storefront');

  // Theme swap có restore — /admin dùng bảng màu admin, trang khác shell dùng storefront.
  useEffect(() => {
    prevTheme.current = document.documentElement.dataset.theme ?? 'storefront';
    document.documentElement.dataset.theme = 'admin';
    return () => {
      document.documentElement.dataset.theme = prevTheme.current;
    };
  }, []);

  // Path sync (popstate — cả back/forward lẫn navigate() của shell dispatch).
  useEffect(() => {
    const onPop = (): void => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Guard boot: token in-memory còn → dùng ngay; không → refresh-on-boot 1 lần
  // (idempotent với boot của mfe-account trong shell; standalone tự đứng được).
  useEffect(() => {
    let alive = true;
    configureAuth({
      refreshUrl: '/api/identity/auth/refresh',
      identityBaseUrl: '',
      loginPath: '/login'
    });
    const boot: Promise<boolean> = authStore.isAuthenticated()
      ? Promise.resolve(true)
      : authStore.refresh();
    void boot
      .catch(() => false)
      .then((authenticated) => {
        if (!alive) return;
        const next = resolveGuardState(authenticated, authStore.getUser()?.roles ?? []);
        if (next === 'guest' && hasShellNavigate()) {
          // Guest trong shell → về login, giữ next để quay lại (UX; LoginPage
          // hiện tại bỏ qua next — user đăng nhập xong bấm lại /admin).
          appNavigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        setState(next);
      });
    return () => {
      alive = false;
    };
  }, []);

  let body: ReactElement;
  if (state === 'booting') {
    body = <p className="admin-booting">{t('admin.guard.checking')}</p>;
  } else if (state === 'guest') {
    // Standalone không có trang login — hướng dẫn mở qua shell.
    body = (
      <div className="admin-guard">
        <EmptyState icon="🔐" title={t('admin.guard.forbiddenTitle')} description={t('admin.guard.standaloneGuest')} />
      </div>
    );
  } else if (state === 'forbidden') {
    body = <ForbiddenPage />;
  } else {
    body = <AdminShell path={path} />;
  }

  return <ToastProvider>{body}</ToastProvider>;
}
