import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { appNavigate } from './bootstrap';
import {
  CART_CHANGED_EVENT,
  cartCount,
  fetchCart,
  type Cart
} from './lib/cartApi';

/**
 * CartBadge (SF-6) — đăng ký vào HeaderSlots slot 'right' từ bootstrap.
 * Đếm = Σ qty từ GET /api/cart (guest 404 → 0, KHÔNG auto-create — contract);
 * refresh khi `ecommerce:cart-changed` (add từ PDP — cùng window qua gateway —
 * hoặc mutation trong cart/checkout page) và khi auth đổi (login → merge xong
 * event cũng phát, nhưng subscribe thêm cho logout: user giỏ khác guest).
 * Click → /cart. Ẩn khi count = 0.
 */
export default function CartBadge(): ReactElement {
  const [count, setCount] = useState(0);

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

  const go = (event: { preventDefault(): void }): void => {
    event.preventDefault();
    appNavigate('/cart');
  };

  return (
    <a
      href="/cart"
      onClick={go}
      data-testid="cart-badge"
      aria-label={`Giỏ hàng — ${count} sản phẩm`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        textDecoration: 'none',
        color: 'var(--c-text, #212121)',
        fontSize: 'var(--text-md, 14px)',
        fontWeight: 600
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18 }}>🛒</span>
      {count > 0 ? (
        <span
          data-testid="cart-badge-count"
          style={{
            position: 'absolute',
            top: -6,
            right: -10,
            background: 'var(--c-primary, #F53D2D)',
            color: '#fff',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            minWidth: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px'
          }}
        >
          {count}
        </span>
      ) : null}
    </a>
  );
}
