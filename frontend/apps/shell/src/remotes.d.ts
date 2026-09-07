// Ambient types cho remote modules — @module-federation/vite không sinh type
// declarations; khai báo tối thiểu để `tsc --noEmit` xanh. Shape thật do
// remote expose (apps/_skeleton-remote/src).
declare module 'skeleton/Page' {
  const Page: import('react').ComponentType;
  export default Page;
}

declare module 'skeleton/HeaderWidget' {
  const HeaderWidget: import('react').ComponentType;
  export default HeaderWidget;
}

// ── mfe-account (SF-3, apps/mfe-account) — login/register/profile remote.
// bootstrap nhận ShellContext do shell truyền lúc initAccountShell (main.tsx);
// remote KHÔNG import code host — shape này là hợp đồng 1 chiều.
declare module 'account/bootstrap' {
  export type SlotKey = 'left' | 'center' | 'right';
  export interface ShellContext {
    HeaderSlots: {
      register(slot: SlotKey, id: string, component: import('react').ComponentType): void;
      unregister(slot: SlotKey, id: string): void;
    };
    navigate: (to: string) => void;
    onRegistryChange?: () => void;
  }
  /** Settle khi boot-refresh xong — AccountPage guard chờ promise này. */
  export const authReady: Promise<boolean>;
  export function initAccountShell(ctx: ShellContext): void;
  export function appNavigate(to: string): void;
}

declare module 'account/AuthWidget' {
  const AuthWidget: import('react').ComponentType;
  export default AuthWidget;
}

declare module 'account/LoginPage' {
  const LoginPage: import('react').ComponentType;
  export default LoginPage;
}

declare module 'account/RegisterPage' {
  const RegisterPage: import('react').ComponentType;
  export default RegisterPage;
}

declare module 'account/ForgotPasswordPage' {
  const ForgotPasswordPage: import('react').ComponentType;
  export default ForgotPasswordPage;
}

declare module 'account/ResetPasswordPage' {
  const ResetPasswordPage: import('react').ComponentType;
  export default ResetPasswordPage;
}

declare module 'account/AccountPage' {
  const AccountPage: import('react').ComponentType;
  export default AccountPage;
}

// ── mfe-account my-orders (SF-9, FI-319) — pages/orders/* slice — additive ──
declare module 'account/OrdersPage' {
  const OrdersPage: import('react').ComponentType;
  export default OrdersPage;
}

declare module 'account/OrderDetailPage' {
  const OrderDetailPage: import('react').ComponentType<{ id: string }>;
  export default OrderDetailPage;
}

declare module 'account/OrdersNavLink' {
  const OrdersNavLink: import('react').ComponentType;
  export default OrdersNavLink;
}

// ── mfe-account SF-8 append — wishlist + my-reviews pages.
declare module 'account/WishlistPage' {
  const WishlistPage: import('react').ComponentType;
  export default WishlistPage;
}

declare module 'account/MyReviewsPage' {
  const MyReviewsPage: import('react').ComponentType;
  export default MyReviewsPage;
}

// ── mfe-account SF-12 append (FI-322) — affiliate dashboard page.
declare module 'account/AffiliatePage' {
  const AffiliatePage: import('react').ComponentType;
  export default AffiliatePage;
}

// ── mfe-checkout (SF-6, apps/mfe-checkout) — cart/checkout/confirmation remote.
// bootstrap nhận ShellContext (cùng shape account/bootstrap) lúc initCheckoutShell.
declare module 'checkout/bootstrap' {
  export type SlotKey = 'left' | 'center' | 'right';
  export interface ShellContext {
    HeaderSlots: {
      register(slot: SlotKey, id: string, component: import('react').ComponentType): void;
      unregister(slot: SlotKey, id: string): void;
    };
    navigate: (to: string) => void;
    onRegistryChange?: () => void;
  }
  export function initCheckoutShell(ctx: ShellContext): void;
  export function appNavigate(to: string): void;
}

declare module 'checkout/CartBadge' {
  const CartBadge: import('react').ComponentType;
  export default CartBadge;
}

declare module 'checkout/CartPage' {
  const CartPage: import('react').ComponentType;
  export default CartPage;
}

declare module 'checkout/CheckoutPage' {
  const CheckoutPage: import('react').ComponentType;
  export default CheckoutPage;
}

declare module 'checkout/ConfirmationPage' {
  const ConfirmationPage: import('react').ComponentType;
  export default ConfirmationPage;
}

// ── mfe-admin (SF-7, apps/mfe-admin) — khu quản trị. bootstrap nhận
// ShellContext do shell truyền lúc initAdminShell (main.tsx); remote KHÔNG
// import code host — shape này là hợp đồng 1 chiều.
declare module 'admin/bootstrap' {
  export type SlotKey = 'left' | 'center' | 'right';
  export interface ShellContext {
    HeaderSlots: {
      register(slot: SlotKey, id: string, component: import('react').ComponentType): void;
      unregister(slot: SlotKey, id: string): void;
    };
    navigate: (to: string) => void;
    onRegistryChange?: () => void;
  }
  export function initAdminShell(ctx: ShellContext): void;
}

declare module 'admin/AdminApp' {
  const AdminApp: import('react').ComponentType;
  export default AdminApp;
}

// ── mfe-account SF-15 append (FI-325) — oauth callback + 2FA pages.
declare module 'account/OAuthCallbackPage' {
  const OAuthCallbackPage: import('react').ComponentType;
  export default OAuthCallbackPage;
}

declare module 'account/TwoFactorPage' {
  const TwoFactorPage: import('react').ComponentType;
  export default TwoFactorPage;
}
