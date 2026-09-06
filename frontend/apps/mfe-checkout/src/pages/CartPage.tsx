import type { ReactElement } from 'react';
import { Button, Card, EmptyState, Skeleton } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { Price, formatPrice } from '@ecommerce/ui-kit';
import { useCart } from '../lib/useCart';
import { cartCount, type CartItem } from '../lib/cartApi';
import '../page.css';

/**
 * Cart page (SF-6) — line items (ảnh/tên/giá/qty stepper/remove), badge
 * "Không còn khả dụng" cho item enrichment 404/OOS (§6.1.2 — KHÔNG xóa, KHÔNG
 * tính subtotal, KHÔNG chặn phần còn lại), summary subtotal TỪ SERVER (giá
 * duyệt — authority là re-price của ordering SF-9), CTA Thanh toán → /checkout
 * (disable khi 0 item khả dụng — contract CreateOrderRequest.items minItems 1).
 */

function CartLine({
  item,
  onChangeQty,
  onRemove
}: {
  item: CartItem;
  onChangeQty: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
}): ReactElement {
  return (
    <div className={`cart-line${item.unavailable ? ' cart-line--unavailable' : ''}`}>
      <img
        className="cart-line-img"
        src={item.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23fafafa"/></svg>'}
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
            Không còn khả dụng
          </span>
        ) : (
          <div className="cart-line-row">
            <div className="qty-stepper" role="group" aria-label="Số lượng">
              <button
                type="button"
                aria-label="Giảm"
                disabled={item.qty <= 1}
                onClick={() => onChangeQty(item.id, item.qty - 1)}
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={99}
                value={item.qty}
                aria-label="Số lượng"
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value, 10);
                  if (!Number.isNaN(next) && next >= 1 && next <= 99) onChangeQty(item.id, next);
                }}
              />
              <button
                type="button"
                aria-label="Tăng"
                disabled={item.qty >= 99}
                onClick={() => onChangeQty(item.id, item.qty + 1)}
              >
                +
              </button>
            </div>
            <button type="button" className="cart-line-remove" onClick={() => onRemove(item.id)}>
              Xóa
            </button>
          </div>
        )}

        {!item.unavailable && (
          <div className="cart-line-row">
            <span className="summary-note">Thành tiền</span>
            <span className="cart-line-price">{formatPrice(item.lineTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CartPage(): ReactElement {
  const { cart, loading, error, changeQty, remove } = useCart();
  const availableCount = cart ? cart.items.filter((item) => !item.unavailable).length : 0;

  if (loading) {
    return (
      <div className="cart-page">
        <h1 className="page-title">Giỏ hàng</h1>
        <Skeleton variant="rect" className="skeleton-line" />
        <Skeleton variant="rect" className="skeleton-line" />
      </div>
    );
  }

  if (error && !cart) {
    return (
      <div className="cart-page">
        <h1 className="page-title">Giỏ hàng</h1>
        <Card>
          <div className="pay-error" role="alert">
            {error}
          </div>
          <Button onClick={() => window.location.reload()}>Thử lại</Button>
        </Card>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="cart-page">
        <h1 className="page-title">Giỏ hàng</h1>
        <Card>
          <EmptyState
            title="Giỏ hàng trống"
            description="Duyệt cửa hàng và thêm sản phẩm bạn thích vào giỏ nhé!"
            action={<Button onClick={() => window.location.assign('/')}>Về trang chủ</Button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1 className="page-title">Giỏ hàng ({cartCount(cart)} sản phẩm)</h1>
      {error ? (
        <div className="pay-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="cart-layout">
        <Card>
          {cart.items.map((item) => (
            <CartLine key={item.id} item={item} onChangeQty={changeQty} onRemove={remove} />
          ))}
        </Card>

        <Card className="cart-summary">
          <h2 style={{ margin: 0, fontSize: 18 }}>Thông tin đơn hàng</h2>
          <div className="summary-row">
            <span>Tạm tính ({availableCount} sản phẩm khả dụng)</span>
            <strong>{formatPrice(cart.subtotal)}</strong>
          </div>
          <div className="summary-note">
            Giá hiển thị trong giỏ là duyệt — tổng cuối cùng được xác nhận lúc đặt hàng.
          </div>
          <hr className="summary-divider" />
          <Button
            variant="primary"
            fullWidth
            disabled={availableCount === 0}
            onClick={() => appNavigate('/checkout')}
          >
            Thanh toán
          </Button>
          {availableCount === 0 ? (
            <div className="summary-note" role="status">
              Không có sản phẩm khả dụng để thanh toán.
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
