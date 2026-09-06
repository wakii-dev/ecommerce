import { useCallback, useEffect, useState } from 'react';
import { authStore } from '@ecommerce/auth';
import {
  CART_CHANGED_EVENT,
  fetchCart,
  removeCartItem,
  updateCartItem,
  type Cart
} from './cartApi';

/**
 * useCart — hook đọc giỏ + mutate, dùng chung CartPage/CartBadge qua event
 * `ecommerce:cart-changed` (một nơi mutation → mọi nơi re-fetch; không cần
 * state library cho tier demo này). CẢNG NHẮC authStore: login/logout đổi
 * giỏ (guest ↔ user) — mount lúc auth chưa settle thì re-fetch khi settle.
 */
export function useCart(): {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  changeQty: (itemId: string, qty: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
} {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    fetchCart()
      .then((value) => {
        setCart(value);
        setError(null);
      })
      .catch((err: unknown) => {
        setCart(null);
        setError(err instanceof Error ? err.message : 'Không tải được giỏ hàng');
      })
      .finally(() => setLoading(false));
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

  const changeQty = useCallback(async (itemId: string, qty: number): Promise<void> => {
    // optimistic — lỗi 409 (vượt tồn kho) → refresh lại từ server
    setCart((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId
                ? { ...item, qty, lineTotal: qty * item.unitPrice }
                : item
            )
          }
        : prev
    );
    try {
      const updated = await updateCartItem(itemId, qty);
      setCart(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đổi được số lượng');
      refresh();
    }
  }, [refresh]);

  const remove = useCallback(async (itemId: string): Promise<void> => {
    try {
      const updated = await removeCartItem(itemId);
      setCart(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được sản phẩm');
      refresh();
    }
  }, [refresh]);

  return { cart, loading, error, refresh, changeQty, remove };
}
