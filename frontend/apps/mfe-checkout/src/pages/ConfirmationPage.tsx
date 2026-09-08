import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Card, EmptyState } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { fetchMyOrder, type Order, type OrderStatus } from '../lib/orderingApi';
import '../page.css';

/**
 * Confirmation page (SF-6 UI, SF-10 live) — cảm ơn + order summary + POLLING
 * `GET /api/ordering/me/orders/{id}` tới trạng thái terminal: sau khi Stripe
 * confirm OK, webhook → payment.succeeded → ordering PAID → CONFIRMED mất vài
 * giây (stripe-cli forward + rabbit). CONFIRMED/SHIPPED/DELIVERED → dừng,
 * hiện "Đang xử lý" + ghi chú email; FAILED/CANCELLED → dừng, hiện thất bại
 * + lý do hết nguồn lực đã được trả lại (stock/coupon). Không vào được đơn
 * (404/401/session khác) → hiển thị snapshot sessionStorage, không crash.
 */

const LAST_ORDER_KEY = 'ecommerce.last_order';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 45; // 90s — TTL webhook/stripe-cli thường < 10s

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

const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Đang xử lý',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao',
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán — đang xác nhận',
  CANCELLED: 'Đã hủy',
  FAILED: 'Thất bại'
};

const TERMINAL_OK: OrderStatus[] = ['CONFIRMED', 'SHIPPED', 'DELIVERED'];
const TERMINAL_BAD: OrderStatus[] = ['FAILED', 'CANCELLED'];

function useOrderPolling(orderId: string | null): {
  live: Order | null;
  pollError: string | null;
} {
  const [live, setLive] = useState<Order | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    attempts.current = 0;
    const tick = async (): Promise<void> => {
      try {
        const order = await fetchMyOrder(orderId);
        if (cancelled) return;
        setLive(order);
        setPollError(null);
        if ([...TERMINAL_OK, ...TERMINAL_BAD].includes(order.status)) return; // terminal — dừng
      } catch {
        if (!cancelled && attempts.current === 0) {
          // lỗi đầu (401 session khác / 404) — vẫn hiện snapshot, không spam
          setPollError('Không tải được trạng thái mới nhất từ hệ thống');
        }
      }
      attempts.current += 1;
      if (!cancelled && attempts.current < POLL_MAX_ATTEMPTS) {
        setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return { live, pollError };
}

export default function ConfirmationPage(): ReactElement {
  const [snapshot] = useState<Order | null>(readLastOrder);
  const { live, pollError } = useOrderPolling(snapshot?.id ?? null);
  // SF-13 A7a: purchase GA4 — fire ĐÚNG 1 LẦN/order khi tới terminal OK
  // (stripe: CONFIRMED sau vài giây poll; COD: CONFIRMED ngay từ create).
  const purchaseFired = useRef<string | null>(null);
  const confirmedOk = live != null && TERMINAL_OK.includes(live.status);

  useEffect(() => {
    if (!live || !confirmedOk || purchaseFired.current === live.id) return;
    purchaseFired.current = live.id;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', 'purchase', {
      transaction_id: live.id,
      value: live.total,
      currency: live.currency ?? 'VND',
      coupon: live.couponCode ?? undefined,
      items: live.items.map((line) => ({
        item_id: line.productId,
        item_name: line.name ?? 'Sản phẩm',
        quantity: line.qty,
        price: line.unitPrice
      }))
    });
  }, [live, confirmedOk]);

  if (!snapshot) {
    return (
      <div className="cart-page">
        <h1 className="page-title">Xác nhận đơn hàng</h1>
        <Card>
          <EmptyState
            title="Không tìm thấy đơn hàng"
            description="Đơn vừa đặt không còn trên máy này (sessionStorage). Đơn của bạn nằm trong mục Đơn hàng của tôi."
            action={<Button onClick={() => appNavigate('/account/orders')}>Đơn hàng của tôi</Button>}
          />
        </Card>
      </div>
    );
  }

  const order = live ?? snapshot;
  const terminalBad = TERMINAL_BAD.includes(order.status);

  return (
    <div className="cart-page">
      <div className="confirm-hero">
        <div className="confirm-check" aria-hidden="true">{terminalBad ? '!' : '✓'}</div>
        <h1 className="page-title">
          {terminalBad ? 'Rất tiếc, đơn hàng chưa thành công' : 'Cảm ơn bạn đã mua hàng!'}
        </h1>
        <div>
          Đơn hàng <strong data-testid="order-id">{order.id}</strong> đã được ghi nhận.
        </div>
        <span
          className="confirm-status"
          data-testid="order-status"
          data-status-code={order.status}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
        {terminalBad ? (
          <div className="pay-warning" role="alert" data-testid="order-failed-note">
            {order.status === 'FAILED'
              ? 'Đơn không hoàn tất — kho và mã giảm giá đã được trả lại, bạn có thể đặt hàng lại.'
              : 'Đơn đã bị hủy. Nếu bạn đã thanh toán, tiền sẽ được hoàn qua cổng thanh toán.'}
            <div>
              <a
                href="/account/orders"
                onClick={(e) => {
                  e.preventDefault();
                  appNavigate('/account/orders');
                }}
                style={{ color: 'var(--c-primary, #F53D2D)' }}
              >
                Xem Đơn hàng của tôi
              </a>
            </div>
          </div>
        ) : null}
        {confirmedOk ? (
          <div className="summary-note" data-testid="order-email-note">
            Email xác nhận đã được gửi kèm hóa đơn PDF — kiểm tra hộp thư dev (Mailpit).
          </div>
        ) : null}
        {pollError && !confirmedOk && !terminalBad ? (
          <div className="summary-note">{pollError}</div>
        ) : null}
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
          {/* SF-3 honesty-pass (ADR 0006 D15-3): nhãn phí phẳng trung thực. */}
          <span>Phí vận chuyển (phí tiêu chuẩn)</span>
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
        <Button variant="secondary" onClick={() => appNavigate('/cart')}>
          Tiếp tục mua sắm
        </Button>
      </Card>
    </div>
  );
}
