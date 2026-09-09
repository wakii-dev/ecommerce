'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { Icon } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { CART_CHANGED_EVENT, cartBadgeCount } from './cart-badge';
import type { CartBadgeCart } from './cart-badge';

/**
 * CartBadge (FI-398 T8, spec §3.6) — port VERBATIM từ mfe-checkout CartBadge
 * (SF-6, FI-393 T3): Đếm = Σ qty từ GET /api/cart (guest 404 → 0, KHÔNG
 * auto-create — contract); refresh khi `ecommerce:cart-changed` (add từ PDP —
 * cùng window qua gateway — hoặc mutation trong cart/checkout page) và khi
 * auth đổi (login → merge xong event cũng phát, nhưng subscribe thêm cho
 * logout: user giỏ khác guest). Click → onOpen?.() (không onOpen → no-op —
 * host tự gắn drawer/điều hướng). FI-393 T3: badge pill accent
 * (--c-accent/--c-on-accent border surface — direction §2.1); labels
 * chrome.cart.aria (mirror shell.cart.aria cũ).
 *
 * Data-access INJECT qua props.fetchCart (checkout giữ cartApi.ts NGUYÊN VỊ —
 * chrome không copy GET; CartBadgeCart structural-compatible với Cart).
 * Badge fetch độc lập qua fetchCart = 1 SUBSCRIBER của server truth
 * (GET /api/cart), KHÔNG phải nguồn state mới — chrome không tạo cart store.
 */
export interface CartBadgeProps {
  fetchCart: () => Promise<CartBadgeCart | null>;
  onOpen?: () => void;
}

export function CartBadge({ fetchCart, onOpen }: CartBadgeProps): ReactElement {
  const { t } = useT();
  const [count, setCount] = useState(0);

  const refresh = useCallback((): void => {
    fetchCart()
      .then((cart: CartBadgeCart | null) => setCount(cartBadgeCount(cart)))
      .catch(() => setCount(0)); // cart-service chết → badge 0, không crash shell
  }, [fetchCart]);

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
    <button
      type="button"
      onClick={() => onOpen?.()}
      data-testid="cart-badge"
      aria-label={t('chrome.cart.aria', { count })}
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
  );
}

export default CartBadge;
