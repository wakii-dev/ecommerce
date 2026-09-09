import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Card, EmptyState, Icon, Modal, QuantityStepper, Skeleton } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { Price, formatPrice } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { useCart } from '../lib/useCart';
import { cartCount, type CartItem } from '../lib/cartApi';
import { storefrontUrl } from '../lib/appUrls';
import { validateCoupon } from '../lib/orderingApi';
import { clearCarryCoupon, setCarryCoupon } from '../lib/couponCarry';
import '../page.css';

/**
 * Cart page (SF-6; FI-393 T4 elevate) — line items (ảnh/tên/giá/qty
 * QuantityStepper primitive + remove CÓ CONFIRM qua Modal), badge
 * "Không còn khả dụng" cho item enrichment 404/OOS (§6.1.2 — KHÔNG xóa,
 * KHÔNG tính subtotal, KHÔNG chặn phần còn lại), summary subtotal TỪ SERVER
 * (giá duyệt — authority là re-price của ordering SF-9), CTA Thanh toán →
 * /checkout (disable khi 0 item khả dụng — contract CreateOrderRequest.items
 * minItems 1). Empty-state CTA về trang chủ STOREFRONT (cross-origin — full nav).
 */

const IMG_FALLBACK =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23fafafa"/></svg>';

function CartLine({
  item,
  onChangeQty,
  onAskRemove
}: {
  item: CartItem;
  onChangeQty: (itemId: string, qty: number) => void;
  onAskRemove: (item: CartItem) => void;
}): ReactElement {
  const { t } = useT();
  return (
    <div className={`cart-line${item.unavailable ? ' cart-line--unavailable' : ''}`}>
      <img
        className="cart-line-img"
        src={item.image || IMG_FALLBACK}
        alt={item.name ?? 'Sản phẩm'}
      />
      <div className="cart-line-info">
        <div className="cart-line-row">
          {item.slug ? (
            <a className="cart-line-name" href={`/p/${item.slug}`}>
              {item.name ?? 'Sản phẩm'}
            </a>
          ) : (
            <span className="cart-line-name">{item.name ?? 'Sản phẩm'}</span>
          )}
          <Price value={item.unitPrice} size="sm" />
        </div>

        {item.unavailable ? (
          <span className="badge-unavailable" role="status">
            {t('checkout.drawer.unavailable')}
          </span>
        ) : (
          <div className="cart-line-row">
            <QuantityStepper
              value={item.qty}
              min={1}
              max={99}
              label={t('ui.quantityStepper.label')}
              increaseLabel={t('ui.quantityStepper.increase')}
              decreaseLabel={t('ui.quantityStepper.decrease')}
              onChange={(qty) => onChangeQty(item.id, qty)}
            />
            <button
              type="button"
              className="cart-line-remove"
              onClick={() => onAskRemove(item)}
            >
              {t('checkout.cart.line.removeFromCart')}
            </button>
          </div>
        )}

        {!item.unavailable && (
          <div className="cart-line-row">
            <span className="summary-note">{t('checkout.cart.line.total')}</span>
            <span className="cart-line-price">{formatPrice(item.lineTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CartPage(): ReactElement {
  const { t } = useT();
  const { cart, loading, error, changeQty, remove } = useCart();
  const availableCount = cart ? cart.items.filter((item) => !item.unavailable).length : 0;
  const [pendingRemove, setPendingRemove] = useState<CartItem | null>(null);

  // FI-393 T5 — coupon áp TỪ cart, carry sang checkout qua sessionStorage.
  // Server-authoritative: validateCoupon(code, cart.subtotal) thật (cùng API
  // checkout dùng); áp OK → setCarryCoupon, gỡ → clearCarryCoupon.
  const [couponInput, setCouponInput] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const confirmRemove = async (): Promise<void> => {
    if (!pendingRemove) return;
    const itemId = pendingRemove.id;
    setPendingRemove(null);
    await remove(itemId);
  };

  const applyCartCoupon = async (): Promise<void> => {
    const code = couponInput.trim();
    if (!code || couponChecking || !cart) return;
    setCouponChecking(true);
    setCouponError(null);
    try {
      const result = await validateCoupon(code, cart.subtotal);
      if (result.valid) {
        setCouponApplied({ code, discount: result.discount });
        setCarryCoupon(code);
      } else {
        setCouponApplied(null);
        clearCarryCoupon();
        setCouponError(result.message ?? t('checkout.coupon.invalid'));
      }
    } catch (err) {
      setCouponApplied(null);
      clearCarryCoupon();
      setCouponError(err instanceof Error ? err.message : t('checkout.coupon.invalid'));
    } finally {
      setCouponChecking(false);
    }
  };

  const removeCartCoupon = (): void => {
    setCouponApplied(null);
    setCouponInput('');
    setCouponError(null);
    clearCarryCoupon();
  };

  if (loading) {
    return (
      <div className="cart-page">
        <h1 className="page-title">{t('nav.cart')}</h1>
        <Skeleton variant="rect" className="skeleton-line" />
        <Skeleton variant="rect" className="skeleton-line" />
      </div>
    );
  }

  if (error && !cart) {
    return (
      <div className="cart-page">
        <h1 className="page-title">{t('nav.cart')}</h1>
        <Card>
          <div className="pay-error" role="alert">
            {error}
          </div>
          <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
        </Card>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="cart-page">
        <h1 className="page-title">{t('nav.cart')}</h1>
        <Card>
          <EmptyState
            icon={<Icon name="cart" size={40} />}
            title={t('checkout.cart.empty.title')}
            description={t('checkout.cart.empty.description')}
            action={
              <Button onClick={() => window.location.assign(storefrontUrl())}>
                {t('checkout.cart.empty.home')}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1 className="page-title">{t('checkout.cart.titleCount', { count: cartCount(cart) })}</h1>
      {error ? (
        <div className="pay-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="cart-layout">
        <Card>
          {cart.items.map((item) => (
            <CartLine
              key={item.id}
              item={item}
              onChangeQty={changeQty}
              onAskRemove={setPendingRemove}
            />
          ))}
        </Card>

        <Card className="cart-summary">
          <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.cart.summary.title')}</h2>
          <div className="summary-row">
            <span>{t('checkout.cart.summary.available', { count: availableCount })}</span>
            <strong>{formatPrice(cart.subtotal)}</strong>
          </div>
          <div className="summary-note">{t('checkout.cart.summary.note')}</div>

          {couponApplied ? (
            <div className="coupon-applied">
              <span>
                <strong>{couponApplied.code.toUpperCase()}</strong> —{' '}
                {t('checkout.coupon.applied', { amount: formatPrice(couponApplied.discount) })}
              </span>
              <button type="button" className="cart-line-remove" onClick={removeCartCoupon}>
                {t('checkout.coupon.remove')}
              </button>
            </div>
          ) : (
            <>
              <div className="coupon-box">
                <input
                  className="cart-coupon__input"
                  aria-label={t('checkout.coupon.label')}
                  placeholder="WELCOME10"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void applyCartCoupon();
                    }
                  }}
                />
                <button
                  type="button"
                  className="cart-coupon__apply"
                  disabled={couponChecking}
                  onClick={() => void applyCartCoupon()}
                >
                  {couponChecking ? t('checkout.coupon.checking') : t('checkout.coupon.apply')}
                </button>
              </div>
              {couponError ? (
                <div className="coupon-error" role="alert">
                  {couponError}
                </div>
              ) : null}
            </>
          )}

          <hr className="summary-divider" />
          <Button
            variant="primary"
            fullWidth
            disabled={availableCount === 0}
            onClick={() => appNavigate('/checkout')}
          >
            {t('checkout.cart.checkout')}
          </Button>
          {availableCount === 0 ? (
            <div className="summary-note" role="status">
              {t('checkout.cart.noAvailable')}
            </div>
          ) : null}
        </Card>
      </div>

      <Modal
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title={t('checkout.cart.removeConfirm.title')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingRemove(null)}>
              {t('checkout.cart.removeConfirm.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void confirmRemove()}>
              {t('checkout.cart.removeConfirm.confirm')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {t('checkout.cart.removeConfirm.description', {
            name: pendingRemove?.name ?? 'Sản phẩm'
          })}
        </p>
      </Modal>
    </div>
  );
}
