/**
 * CartBadge wrapper (FI-398 T8, spec §3.6) — NGUỒN widget chuyển sang
 * `@ecommerce/chrome` (CartBadge + CART_CHANGED_EVENT + cartBadgeCount);
 * checkout giữ data-access (lib/cartApi fetchCart) và UI phụ (MiniCartDrawer).
 *
 * Đăng ký `'right','checkout-cart-badge'` trong bootstrap.tsx GIỮ NGUYÊN:
 * wrapper giữ nguyên path/default export `./CartBadge` → bootstrap KHÔNG đổi
 * (touch-map dòng "bootstrap.tsx đụng" ở T8 rơi vào no-op có chủ đích).
 *
 * Drawer mount ĐIỀU KIỆN (`drawerOpen &&`) GIỮ — shell boot không thêm GET nào
 * (badge fetch độc lập = 1 subscriber của server truth; drawer chỉ fetch khi mở).
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { CartBadge as ChromeCartBadge } from '@ecommerce/chrome';
import { fetchCart } from './lib/cartApi';
import MiniCartDrawer from './MiniCartDrawer';

export default function CartBadge(): ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <ChromeCartBadge fetchCart={fetchCart} onOpen={() => setDrawerOpen(true)} />
      {drawerOpen ? <MiniCartDrawer open onClose={() => setDrawerOpen(false)} /> : null}
    </>
  );
}
