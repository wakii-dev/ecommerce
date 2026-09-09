import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { Icon } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import {
  CART_CHANGED_EVENT,
  cartCount,
  fetchCart,
  type Cart
} from './lib/cartApi';
import MiniCartDrawer from './MiniCartDrawer';

/**
 * CartBadge (SF-6, FI-393 T3) — đăng ký vào HeaderSlots slot 'right' từ bootstrap.
 * Đếm = Σ qty từ GET /api/cart (guest 404 → 0, KHÔNG auto-create — contract);
 * refresh khi `ecommerce:cart-changed` (add từ PDP — cùng window qua gateway —
 * hoặc mutation trong cart/checkout page) và khi auth đổi (login → merge xong
 * event cũng phát, nhưng subscribe thêm cho logout: user giỏ khác guest).
 * Click → mở MiniCartDrawer. FI-393 T3: emoji 🛒 → Icon cart; badge pill
 * accent (--c-accent/--c-on-accent border surface — direction §2.1).
 *
 * CartBadge fetch riêng + useCart trong drawer = 2 SUBSCRIBER của cùng server
 * truth (GET /api/cart), KHÔNG phải 2 nguồn state — drawer mount ĐIỀU KIỆN
 * (`drawerOpen &&`) nên shell boot không thêm GET nào.
 */
export default function CartBadge(): ReactElement {
  const { t } = useT();
  const [count, setCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback((): void => {
    fetchCart()
      .then((cart: Cart | null) => setCount(cartCount(cart)))
      .catch(() => setCount(0)); // cart-service chết → badge 0, không crash shell
  }, []);

  useEffect(() => {
    void refresh();
    const onChanged = (): void => refresh();
    window.addEventListener(CART_CHANGED_EVENT, onChanged);
    const unsubAuth = authStore.subscribe(onChanged);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, onChanged);
      unsubAuth();
    };
  }, [refresh]);

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        data-testid="cart-badge"
        aria-label={t('shell.cart.aria', { count })}
        aria-haspopup="dialog"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--c-text, #212121)',
          fontSize: 'var(--text-md, 14px)',
          fontWeight: 600
        }}
      >
        <Icon name="cart" size={22} />
        {count > 0 ? (
          <span
            data-testid="cart-badge-count"
            style={{
              position: 'absolute',
              top: -6,
              right: -10,
              boxSizing: 'border-box',
              background: 'var(--c-accent)',
              color: 'var(--c-on-accent)',
              border: '2px solid var(--c-surface)',
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 800,
              minWidth: 18,
              height: 18,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 2px'
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
      {drawerOpen ? (
        <MiniCartDrawer open onClose={() => setDrawerOpen(false)} />
      ) : null}
    </>
  );
}
