// lib/guard.ts — logic guard + route resolver THUẦN (không React) để test node.
import type { IconName } from '@ecommerce/ui-kit';
import type { AdminIconName } from '../components/AdminIcon';

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
  | 'audit' // SF-13 (FI-323) append
  | 'newsletter' // SF-13 A8 append
  | 'rma' // SF-14 (FI-324) append
  | 'loyalty' // SF-14 (FI-324) append
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
  if (rest === '/audit') return { page: 'audit' }; // SF-13 append
  if (rest === '/newsletter') return { page: 'newsletter' }; // SF-13 A8
  if (rest === '/rma') return { page: 'rma' }; // SF-14 append
  if (rest === '/loyalty') return { page: 'loyalty' }; // SF-14 append
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
  { to: '/admin/affiliates', key: 'admin.nav.affiliates' },
  // SF-13 (FI-323) append — audit log viewer (D21)
  { to: '/admin/audit', key: 'admin.nav.audit' },
  { to: '/admin/newsletter', key: 'admin.nav.newsletter' },
  // SF-14 (FI-324) append — RMA queue + loyalty adjust (D22)
  { to: '/admin/rma', key: 'admin.nav.rma' },
  { to: '/admin/loyalty', key: 'admin.nav.loyalty' }
] as const;

/** Icon nav: dùng lại catalog Icon.tsx của ui-kit, thiếu thì AdminIcon bù. */
export type AdminNavIcon = IconName | AdminIconName;

export interface AdminNavItem {
  to: string;
  key: string;
  icon: AdminNavIcon;
}

export interface AdminNavGroup {
  labelKey: string;
  items: ReadonlyArray<AdminNavItem>;
}

/**
 * Nav sidebar theo NHÓM (SF-5 FI-395 T2 — direction §2.5): Tổng quan · Sản
 * phẩm · Đơn hàng · Khách hàng & tương tác · Hệ thống. Thứ tự item GIỮ thứ tự
 * flat của ADMIN_NAV (activeNavIndex map page→index phía dưới vẫn khớp —
 * /admin/orders/o-1 active Orders index 5).
 * Count-badge active: BỎ (cần data fetch mới = logic mới — cấm theo plan §4).
 */
export const ADMIN_NAV_GROUPS: ReadonlyArray<AdminNavGroup> = [
  {
    labelKey: 'admin.nav.group.overview',
    items: [{ to: '/admin/dashboard', key: 'admin.nav.dashboard', icon: 'grid' }]
  },
  {
    labelKey: 'admin.nav.group.products',
    items: [
      { to: '/admin/products', key: 'admin.nav.products', icon: 'package' },
      { to: '/admin/categories', key: 'admin.nav.categories', icon: 'folder' },
      { to: '/admin/coupons', key: 'admin.nav.coupons', icon: 'ticket' }
    ]
  },
  {
    labelKey: 'admin.nav.group.orders',
    items: [
      { to: '/admin/orders', key: 'admin.nav.orders', icon: 'cart' },
      { to: '/admin/rma', key: 'admin.nav.rma', icon: 'rotate-ccw' }
    ]
  },
  {
    labelKey: 'admin.nav.group.engagement',
    items: [
      { to: '/admin/reviews', key: 'admin.nav.reviews', icon: 'star' },
      { to: '/admin/affiliates', key: 'admin.nav.affiliates', icon: 'user' },
      { to: '/admin/newsletter', key: 'admin.nav.newsletter', icon: 'mail' },
      { to: '/admin/loyalty', key: 'admin.nav.loyalty', icon: 'award' }
    ]
  },
  {
    labelKey: 'admin.nav.group.system',
    items: [{ to: '/admin/audit', key: 'admin.nav.audit', icon: 'file-text' }]
  }
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
    affiliates: 6, // SF-12 append
    audit: 7, // SF-13 append
    newsletter: 8, // SF-13 A8
    rma: 9, // SF-14 append
    loyalty: 10 // SF-14 append
  };
  return idxByPage[route.page] ?? 0;
}
