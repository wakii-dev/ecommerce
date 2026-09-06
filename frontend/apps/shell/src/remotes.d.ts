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

declare module 'account/AccountPage' {
  const AccountPage: import('react').ComponentType;
  export default AccountPage;
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
