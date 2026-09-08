import type { ReactElement } from 'react';
import { Drawer, EmptyState, Icon, Skeleton } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { appNavigate } from './bootstrap';
import { useCart } from './lib/useCart';
import { cartCount, type CartItem } from './lib/cartApi';

/**
 * Mini-cart drawer (FI-393 T3) — ui-kit Drawer, mở từ CartBadge. Đọc giỏ qua
 * `useCart()` hiện có (event + auth subscribe sẵn) — KHÔNG fetch path mới,
 * KHÔNG nguồn cart state thứ 2 (P0): khi drawer mở, CartBadge.fetch + useCart
 * là 2 SUBSCRIBER của cùng server truth. Mount điều kiện từ CartBadge
 * (`{drawerOpen && <MiniCartDrawer/>}`) để shell boot không thêm GET /api/cart.
 * Anatomy theo direction §2.6: head nền primary, items ảnh 64 + qty badge,
 * footer freeship tint-success + "Tạm tính" 24/800 danger + 2 CTA cao 44.
 */

/** Ngưỡng freeship hiển thị trên banner footer (giá trị demo — direction §2.6). */
const FREESHIP_MIN = 500000;

const IMG_FALLBACK =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23fafafa"/></svg>';

function MiniCartLine({ item }: { item: CartItem }): ReactElement {
  const { t } = useT();
  return (
    <div className="mini-cart-line">
      <span className="mini-cart-line__thumb">
        <img src={item.image || IMG_FALLBACK} alt={item.name ?? 'Sản phẩm'} />
        <span className="mini-cart-line__qty" aria-hidden="true">
          {item.qty}
        </span>
      </span>
      <span className="mini-cart-line__info">
        <span className="mini-cart-line__name">{item.name ?? 'Sản phẩm'}</span>
        {item.unavailable ? (
          <span className="badge-unavailable" role="status">
            {t('checkout.drawer.unavailable')}
          </span>
        ) : (
          <span className="mini-cart-line__price">{formatPrice(item.unitPrice)}</span>
        )}
      </span>
    </div>
  );
}

function MiniCartSkeleton(): ReactElement {
  return (
    <div className="mini-cart-line" aria-hidden="true">
      <Skeleton variant="rect" width={64} height={64} />
      <span className="mini-cart-line__info">
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="text" width="40%" />
      </span>
    </div>
  );
}

export default function MiniCartDrawer({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  const { t } = useT();
  const { cart, loading } = useCart();

  const items = cart?.items ?? [];
  const availableCount = items.filter((item) => !item.unavailable).length;
  const count = cartCount(cart);

  const goCart = (): void => {
    onClose();
    appNavigate('/cart');
  };
  const goCheckout = (): void => {
    onClose();
    appNavigate('/checkout');
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="right"
      title={
        <span>
          {t('checkout.drawer.title')}
          {count > 0 ? <span className="mini-cart__count">{count}</span> : null}
        </span>
      }
      footer={
        items.length > 0 ? (
          <div className="mini-cart__foot">
            <div className="mini-cart__freeship">
              {t('checkout.drawer.freeship', { amount: formatPrice(FREESHIP_MIN) })}
            </div>
            <div className="mini-cart__subtotal-row">
              <span>{t('checkout.drawer.subtotal')}</span>
              <strong className="mini-cart__subtotal">{formatPrice(cart?.subtotal ?? 0)}</strong>
            </div>
            <div className="mini-cart__ctas">
              <button
                type="button"
                className="mini-cart__btn mini-cart__btn--outline"
                onClick={goCart}
              >
                {t('checkout.drawer.viewCart')}
              </button>
              <button
                type="button"
                className="mini-cart__btn mini-cart__btn--solid"
                onClick={goCheckout}
                disabled={availableCount === 0}
              >
                {t('checkout.drawer.checkout')}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <>
          <MiniCartSkeleton />
          <MiniCartSkeleton />
        </>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Icon name="cart" size={40} />}
          title={t('checkout.drawer.empty')}
          action={
            <button
              type="button"
              className="mini-cart__btn mini-cart__btn--outline"
              onClick={goCart}
            >
              {t('checkout.drawer.viewCart')}
            </button>
          }
        />
      ) : (
        items.map((item) => <MiniCartLine key={item.id} item={item} />)
      )}
    </Drawer>
  );
}
