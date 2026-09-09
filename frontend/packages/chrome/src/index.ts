// Barrel @ecommerce/chrome — mọi public API của package đi qua đây.
// Mỗi task SF-1 mở rộng file này (header-slots, SiteHeader, Footer, …).

export { HEADER_SLOTS_CHANGED_EVENT, HeaderSlots } from './header-slots';
export type { SlotKey } from './header-slots';
export { SessionBootProvider, ensureSession } from './session-boot';
export type { SessionBootOptions } from './session-boot';
