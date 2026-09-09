import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Card, EmptyState, Icon } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { appNavigate } from '../bootstrap';
import { fetchMyOrder, type Order, type OrderStatus } from '../lib/orderingApi';
import { storefrontUrl } from '../lib/appUrls';
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
  const { t } = useT();
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
            icon={<Icon name="package" size={40} />}
            title={t('checkout.confirmation.notFound.title')}
            description={t('checkout.confirmation.notFound.description')}
            action={
              <Button onClick={() => appNavigate('/account/orders')}>
                {/* cùng chuỗi 'Đơn hàng của tôi' — key duy nhất có text này */}
                {t('checkout.payUnavailable.ctaLink')}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const order = live ?? snapshot;
  const terminalBad = TERMINAL_BAD.includes(order.status);
  // FI-393 T9 — label trạng thái qua catalog; key thiếu → hiện raw status
  const statusKey = `checkout.confirmation.status.${order.status}`;
  const statusLabel = t(statusKey) === statusKey ? order.status : t(statusKey);

  return (
    <div className="cart-page">
      <div className="confirm-hero">
        <div
          className={`confirm-check${terminalBad ? ' confirm-check--bad' : ''}`}
          aria-hidden="true"
        >
          <Icon name={terminalBad ? 'alert' : 'check'} size={30} />
        </div>
        <div className="confirm-kicker">{t('checkout.confirmation.kicker')}</div>
        <h1 className="page-title">
          {terminalBad
            ? t('checkout.confirmation.hero.fail')
            : t('checkout.confirmation.hero.ok')}
        </h1>
        <div className="confirm-received">
          {/* testid bọc RIÊNG id (visually-hidden → textContent = đúng id) */}
          <span className="visually-hidden" data-testid="order-id">
            {order.id}
          </span>
          {t('checkout.confirmation.received', { id: order.id })}
        </div>
        <span
          className="confirm-status"
          data-testid="order-status"
          data-status-code={order.status}
        >
          {statusLabel}
        </span>
        {terminalBad ? (
          <div className="pay-warning" role="alert" data-testid="order-failed-note">
            {order.status === 'FAILED'
              ? t('checkout.confirmation.failedNote')
              : t('checkout.confirmation.cancelledNote')}
            <div>
              <a
                href="/account/orders"
                onClick={(e) => {
                  e.preventDefault();
                  appNavigate('/account/orders');
                }}
                style={{ color: 'var(--c-primary, #F53D2D)' }}
              >
                {t('checkout.confirmation.myOrders')}
              </a>
            </div>
          </div>
        ) : null}
        {confirmedOk ? (
          <div className="summary-note" data-testid="order-email-note">
            {t('checkout.confirmation.emailNote')}
          </div>
        ) : null}
        {pollError && !confirmedOk && !terminalBad ? (
          <div className="summary-note">{pollError}</div>
        ) : null}
      </div>

      <Card className="cart-summary">
        <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.confirmation.detail')}</h2>
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
          <span>{t('checkout.summary.subtotal')}</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        {order.discount > 0 && (
          <div className="summary-row summary-row--discount">
            <span>
              {t('checkout.summary.discount')} {order.couponCode ? `(${order.couponCode})` : ''}
            </span>
            <span className="summary-value">−{formatPrice(order.discount)}</span>
          </div>
        )}
        <div className="summary-row">
          {/* SF-3 honesty-pass (ADR 0006 D15-3): nhãn phí phẳng trung thực. */}
          <span>{t('checkout.summary.shipping')}</span>
          <span>{formatPrice(order.shippingFee)}</span>
        </div>
        <hr className="summary-divider" />
        <div className="summary-row summary-row--total">
          <span>{t('checkout.summary.total')}</span>
          <span>{formatPrice(order.total)}</span>
        </div>
        <div className="summary-note">
          {t('checkout.summary.shipTo')}{' '}
          {[order.address.line1, order.address.ward, order.address.district, order.address.city]
            .filter(Boolean)
            .join(', ')}
        </div>
        {/* FI-393 T9 — CTA về trang chủ STOREFRONT (cross-origin → full nav,
            KHÔNG appNavigate); style accent theo direction §2.4 */}
        <Button
          variant="secondary"
          className="confirm-cta"
          onClick={() => window.location.assign(storefrontUrl())}
        >
          {t('checkout.confirmation.ctaHome')}
        </Button>
      </Card>
    </div>
  );
}
