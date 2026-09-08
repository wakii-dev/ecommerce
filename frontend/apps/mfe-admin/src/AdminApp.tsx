import { useEffect, useRef, useState } from 'react';
// FI-368 T11: page.css trước đây chỉ import ở main.tsx (standalone) — dưới
// shell remote chỉ load module expose => admin nhúng MẤT TOÀN BỘ layout/pill
// (walkthrough 5 màn đầu tiên phát hiện). Vite dedupe nên standalone vẫn 1 lần.
import './page.css';
import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
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
import AuditPage from './pages/AuditPage';
import NewsletterPage from './pages/NewsletterPage';
import AffiliatesPage from './pages/AffiliatesPage';
import CategoriesPage from './pages/CategoriesPage';
import CouponsPage from './pages/CouponsPage';
import DashboardPage from './pages/DashboardPage';
import ForbiddenPage from './pages/ForbiddenPage';
import LoyaltyPage from './pages/LoyaltyPage'; // SF-14 (FI-324) append
import OrderDetailPage from './pages/OrderDetailPage';
import OrdersPage from './pages/OrdersPage';
import ProductFormPage from './pages/ProductFormPage';
import ProductsListPage from './pages/ProductsListPage';
import ReviewsPage from './pages/ReviewsPage';
import RmaPage from './pages/RmaPage'; // SF-14 (FI-324) append

const STOREFRONT_URL: string =
  (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:3000';

// Query client riêng của admin (shell không wrap provider) — module-level vì
// remote module load đúng 1 lần; react/react-query là shared singleton.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false }
  }
});

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
    case 'affiliates': // SF-12 (FI-322) append
      return <AffiliatesPage />;
    case 'audit': // SF-13 (FI-323) append
      return <AuditPage />;
    case 'newsletter': // SF-13 A8 append
      return <NewsletterPage />;
    case 'rma': // SF-14 (FI-324) append
      return <RmaPage />;
    case 'loyalty': // SF-14 (FI-324) append
      return <LoyaltyPage />;
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
      .then(() => {
        // Shell: subscribe applyGuard đã redirect /login?next=... — không
        // double-nav. Standalone: về loginPath của host (main.tsx set '/'
        // vì :5177 không có route /login — hardcode cũ là dead-end 404).
        if (!hasShellNavigate()) appNavigate(authStore.getLoginPath() ?? '/login');
      });
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

// Boot auth DÙNG CHUNG cho mọi mount của AdminApp trong 1 trang. Refresh-on-boot
// chạy ĐỒNG THỜI với refresher instance khác (initAccountShell eager refresh —
// mfe-account/bootstrap.tsx) trong khi identity XOAY refresh cookie mỗi lần dùng
// → caller song song ăn 401 (thua race) và logout() xóa token vừa set, guard
// bounce login dù user đã đăng nhập (bắt được qua browser walkthrough 16:27 —
// 3 call song song trong cửa sổ 23ms). Vì vậy: (1) mọi mount chia sẻ ĐÚNG 1
// promise boot; (2) thua race → chờ call kia xoay xong cookie (đo thực tế
// 10-150ms) rồi thử ĐÚNG 1 lần nữa trước khi kết luận guest.
let bootAuth: Promise<boolean> | null = null;
function bootAuthenticate(): Promise<boolean> {
  bootAuth ??= (async () => {
    if (authStore.isAuthenticated()) return true;
    if (await authStore.refresh().catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return authStore.refresh().catch(() => false);
  })().finally(() => {
    bootAuth = null;
  });
  return bootAuth;
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

  // Theme map 4 trạng thái (FI-395 T1): theme shell light/dark được remap sang
  // admin/admin-dark khi admin mount. Shell ThemeToggle flip attribute
  // data-theme GIỮA phiên admin → MutationObserver theo ngay (KHÔNG matchMedia
  // — jsdom test an toàn). Unmount: disconnect + restore theme trước đó.
  useEffect(() => {
    prevTheme.current = document.documentElement.dataset.theme ?? 'storefront';
    // Mapping idempotent: gán lại cùng giá trị không đốt observer callback
    // (attribute chỉ "mutate" khi giá trị thực sự đổi) → không loop.
    const applyAdminTheme = (): void => {
      const theme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme =
        theme === 'dark' || theme === 'admin-dark' ? 'admin-dark' : 'admin';
    };
    applyAdminTheme();
    const observer = new MutationObserver(applyAdminTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    return () => {
      observer.disconnect();
      document.documentElement.dataset.theme = prevTheme.current;
    };
  }, []);

  // Path sync (popstate — cả back/forward lẫn navigate() của shell dispatch).
  useEffect(() => {
    const onPop = (): void => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Guard apply DÙNG CHUNG: boot settle lẫn logout/401 giữa phiên (authStore
  // subscribe dưới) đều qua đây — logout phải flip layout về guest/forbidden
  // NGAY, không giữ chrome admin treo (standalone không có route /login để
  // đón → dead-end "Không tìm thấy trang").
  const applyGuard = (): void => {
    const next = resolveGuardState(authStore.isAuthenticated(), authStore.getUser()?.roles ?? []);
    if (next === 'guest' && hasShellNavigate()) {
      // Guest trong shell → về login, giữ next để quay lại (UX; LoginPage
      // hiện tại bỏ qua next — user đăng nhập xong bấm lại /admin).
      appNavigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setState(next);
  };

  // Guard boot: token in-memory còn → dùng ngay; không → refresh-on-boot 1 lần
  // (idempotent với boot của mfe-account trong shell; standalone tự đứng được).
  useEffect(() => {
    let alive = true;
    // KHÔNG set loginPath ở đây — config của host phải thắng (configureAuth
    // là merge): bootstrap.tsx shell '/login', main.tsx standalone '/'.
    configureAuth({
      refreshUrl: '/api/identity/auth/refresh',
      identityBaseUrl: ''
    });
    // Giữa phiên: logout/expire (notify) → re-eval guard. Bỏ qua khi boot
    // đang chạy (bootAuth non-null) — boot.then apply 1 lần khi settle.
    const unsubscribe = authStore.subscribe(() => {
      if (alive && !bootAuth) applyGuard();
    });
    const boot: Promise<boolean> = bootAuthenticate();
    void boot
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
      unsubscribe();
    };
  }, []);

  let body: ReactElement;
  if (state === 'booting') {
    body = <p className="admin-booting">{t('admin.guard.checking')}</p>;
  } else if (state === 'guest') {
    // Standalone không có trang login — hướng dẫn + link sang shell login
    // (next=%2Fadmin; LoginPage honor next → login xong quay đúng lại admin).
    body = (
      <div className="admin-guard">
        <EmptyState icon="🔐" title={t('admin.guard.forbiddenTitle')} description={t('admin.guard.standaloneGuest')} />
        <p>
          <a className="admin-guard__login" href="http://localhost:5173/login?next=%2Fadmin">
            {t('admin.guard.loginViaShell')}
          </a>
        </p>
      </div>
    );
  } else if (state === 'forbidden') {
    body = <ForbiddenPage />;
  } else {
    body = <AdminShell path={path} />;
  }

  // I18nextProvider TƯƠNG MINH: workspace có thể resolve nhiều instance i18next
  // (pnpm store theo version) — bind useTranslation (react-i18next) CHẶC vào
  // global instance mà initI18n() đã init (shell/standalone gọi trước render).
  return (
    <I18nextProvider i18n={i18next}>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{body}</QueryClientProvider>
      </ToastProvider>
    </I18nextProvider>
  );
}
