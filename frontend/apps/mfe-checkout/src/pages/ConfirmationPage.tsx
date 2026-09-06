import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Card, EmptyState } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import type { Order } from '../lib/orderingStub';
import '../page.css';

/**
 * Confirmation page (SF-6) — cảm ơn + order summary + trạng thái mock "Đang
 * xử lý" (CONFIRMED sau mock-webhook PENDING→PAID→CONFIRMED). Order đọc từ
 * sessionStorage (stub không có server persist; SF-10 sẽ fetch /me/orders).
 * Vào trang trực tiếp mà không có order → empty state, không crash.
 */

const LAST_ORDER_KEY = 'ecommerce.last_order';

function readLastOrder(): Order | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Order;
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

const STATUS_LABEL: Partial<Record<Order['status'], string>> = {
  CONFIRMED: 'Đang xử lý',
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán'
};

export default function ConfirmationPage(): ReactElement {
  const [order] = useState<Order | null>(readLastOrder);

  if (!order) {
    return (
      <div className="cart-page">
        <h1 className="page-title">Xác nhận đơn hàng</h1>
        <Card>
          <EmptyState
            title="Không tìm thấy đơn hàng"
            description="Đơn vừa đặt không còn trên máy này (sessionStorage). Với hệ thống thật, đơn nằm trong mục Đơn hàng của tôi (SF-9)."
            action={<Button onClick={() => window.location.assign('/')}>Về trang chủ</Button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="confirm-hero">
        <div className="confirm-check" aria-hidden="true">✓</div>
        <h1 className="page-title">Cảm ơn bạn đã mua hàng!</h1>
        <div>
          Đơn hàng <strong data-testid="order-id">{order.id}</strong> đã được ghi nhận.
        </div>
        <span className="confirm-status" data-testid="order-status">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <Card className="cart-summary">
        <h2 style={{ margin: 0, fontSize: 18 }}>Chi tiết đơn</h2>
        {order.items.map((line) => (
          <div className="summary-row" key={line.id}>
            <span>
              {line.name ?? 'Sản phẩm'} × {line.qty}
            </span>
            <span>{formatPrice(line.lineTotal)}</span>
          </div>
        ))}
        <hr className="summary-divider" />
        <div className="summary-row">
          <span>Tạm tính</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        {order.discount > 0 && (
          <div className="summary-row summary-row--discount">
            <span>Giảm giá {order.couponCode ? `(${order.couponCode})` : ''}</span>
            <span className="summary-value">−{formatPrice(order.discount)}</span>
          </div>
        )}
        <div className="summary-row">
          <span>Phí vận chuyển</span>
          <span>{formatPrice(order.shippingFee)}</span>
        </div>
        <hr className="summary-divider" />
        <div className="summary-row summary-row--total">
          <span>Tổng cộng</span>
          <span>{formatPrice(order.total)}</span>
        </div>
        <div className="summary-note">
          Giao tới: {[order.address.line1, order.address.ward, order.address.district, order.address.city]
            .filter(Boolean)
            .join(', ')}
        </div>
        <div className="summary-note">
          Email xác nhận + trạng thái đơn sẽ khả dụng khi hệ thống đơn hàng chạy thật (SF-9/SF-10).
        </div>
        <Button variant="secondary" onClick={() => appNavigate('/cart')}>
          Tiếp tục mua sắm
        </Button>
      </Card>
    </div>
  );
}
