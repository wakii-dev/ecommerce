// lib/guard.ts — logic guard + route resolver THUẦN (không React) để test node.

export type AdminGuardState = 'guest' | 'forbidden' | 'ok';

/**
 * Quyết định trang thái guard sau khi boot-refresh settle:
 * - chưa đăng nhập → guest (redirect /login?next= trong shell)
 * - đăng nhập nhưng thiếu role admin → forbidden (trang 403)
 * - đủ → ok
 * Role so sánh case-insensitive — identity cấp `roles:["ADMIN"]` (uppercase).
 */
export function resolveGuardState(
  authenticated: boolean,
  roles: readonly string[]
): AdminGuardState {
  if (!authenticated) return 'guest';
  return roles.some((role) => role.toLowerCase() === 'admin') ? 'ok' : 'forbidden';
}

export type AdminPageKey =
  | 'dashboard'
  | 'products'
  | 'product-new'
  | 'product-edit'
  | 'categories'
  | 'coupons'
  | 'affiliates' // SF-12 (FI-322) append
  | 'reviews'
  | 'orders'
  | 'order-detail'
  | 'not-found';

export interface AdminRoute {
  page: AdminPageKey;
  /** Id resource cho product-edit / order-detail (đoạn sau /admin/.../). */
  id?: string;
}

/** Map pathname → route nội bộ của admin. Path ngoài /admin → not-found. */
export function resolveAdminRoute(pathname: string): AdminRoute {
  const rest = pathname.replace(/^\/admin/, '');
  if (rest === '' || rest === '/' || rest === '/dashboard') return { page: 'dashboard' };
  if (rest === '/products') return { page: 'products' };
  if (rest === '/products/new') return { page: 'product-new' };
  const productEdit = rest.match(/^\/products\/([^/]+)$/);
  if (productEdit) return { page: 'product-edit', id: productEdit[1] };
  if (rest === '/categories') return { page: 'categories' };
  if (rest === '/coupons') return { page: 'coupons' };
  if (rest === '/affiliates') return { page: 'affiliates' }; // SF-12 append
  if (rest === '/reviews') return { page: 'reviews' };
  if (rest === '/orders') return { page: 'orders' };
  const orderDetail = rest.match(/^\/orders\/([^/]+)$/);
  if (orderDetail) return { page: 'order-detail', id: orderDetail[1] };
  return { page: 'not-found' };
}

/** Nav sidebar — thứ tự cố định theo pack (Dashboard, Products, Categories, Coupons, Reviews, Orders). */
export const ADMIN_NAV: ReadonlyArray<{ to: string; key: string }> = [
  { to: '/admin/dashboard', key: 'admin.nav.dashboard' },
  { to: '/admin/products', key: 'admin.nav.products' },
  { to: '/admin/categories', key: 'admin.nav.categories' },
  { to: '/admin/coupons', key: 'admin.nav.coupons' },
  { to: '/admin/reviews', key: 'admin.nav.reviews' },
  { to: '/admin/orders', key: 'admin.nav.orders' },
  // SF-12 (FI-322) append — affiliates manage (D20)
  { to: '/admin/affiliates', key: 'admin.nav.affiliates' }
] as const;

/** Nav item nào active cho pathname (prefix match; /admin/products/x vẫn active Products). */
export function activeNavIndex(pathname: string): number {
  const route = resolveAdminRoute(pathname);
  const idxByPage: Partial<Record<AdminPageKey, number>> = {
    dashboard: 0,
    products: 1,
    'product-new': 1,
    'product-edit': 1,
    categories: 2,
    coupons: 3,
    reviews: 4,
    orders: 5,
    'order-detail': 5,
    affiliates: 6 // SF-12 append
  };
  return idxByPage[route.page] ?? 0;
}
