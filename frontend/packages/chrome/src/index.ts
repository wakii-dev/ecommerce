// Barrel @ecommerce/chrome — mọi public API của package đi qua đây.
// Mỗi task SF-1 mở rộng file này (header-slots, SiteHeader, Footer, …).

export { HEADER_SLOTS_CHANGED_EVENT, HeaderSlots } from './header-slots';
export type { SlotKey } from './header-slots';
export { SiteHeader } from './SiteHeader';
export { Footer } from './Footer';
export { localePath, setChromeSite, sfUrl, shellUrl } from './site';
export type { ChromeSiteConfig, Locale } from './site';
export {
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
  resolveTheme,
  storedThemeValue
} from './theme';
export type { Theme } from './theme';
export { ThemeToggle } from './ThemeToggle';
export { LocaleSwitcher } from './LocaleSwitcher';
export { LANG_STORAGE_KEY, storedLang } from './lang';
export { SessionBootProvider, ensureSession } from './session-boot';
export type { SessionBootOptions } from './session-boot';
export { CART_CHANGED_EVENT, cartBadgeCount } from './cart-badge';
export type { CartBadgeCart } from './cart-badge';
export { CartBadge } from './CartBadge';
export { AuthMenu } from './AuthMenu';
export type { AuthMenuProps } from './AuthMenu';
