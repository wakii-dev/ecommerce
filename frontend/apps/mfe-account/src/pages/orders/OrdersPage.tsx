// pages/orders/OrdersPage.tsx — my-orders list (SF-9 file-slice; SF-4 FI-394 T5 polish).
// Đơn thật từ ordering qua gateway: pill trạng thái 6 màu đúng token --pill-*
// (direction §2.5: 11/800 ls .05 padding 3×9 full), ngày vi-VN, total VND,
// ListSkeleton khi tải, empty/error EmptyState icon thay emoji.
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Card, EmptyState, Icon, ListSkeleton } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { authStore } from '@ecommerce/auth';
import { AccountLayout } from '../../AccountLayout';
import { appNavigate, authReady } from '../../bootstrap';
import { fetchMyOrders, type OrderStatus, type OrderSummary } from './ordersApi';

/** Slug pill theo trạng thái — FAILED family cancelled (đỏ) qua class .pill--failed. */
const STATUS_SLUG: Record<OrderStatus, string> = {
  PENDING: 'pending',
  PAID: 'paid',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

/** Pill trạng thái — màu qua var(--pill-<slug>-*) (page.css), label qua i18n.
 *  Export GIỮ (OrderDetailPage import); useT an toàn vì đây là React component. */
export function StatusBadge({ status }: { status: OrderStatus }): ReactElement {
  const { t } = useT();
  const slug = STATUS_SLUG[status] ?? 'cancelled';
  return <span className={`pill pill--${slug}`}>{t(`account.order.status.${slug}`)}</span>;
}

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function OrdersPageContent(): ReactElement {
  const { t } = useT();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Guard CHỜ authReady như AccountPage — F5 không bị ném về /login do race
    authReady.then(() => {
      if (!alive) return;
      if (!authStore.isAuthenticated()) {
        appNavigate('/login');
        return;
      }
      fetchMyOrders()
        .then((page) => alive && setOrders(page.items))
        .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : t('account.order.errorGeneric')));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="alert" size={40} />}
          title={t('account.orders.errorTitle')}
          description={error}
          action={<Button onClick={() => window.location.reload()}>{t('account.orders.retry')}</Button>}
        />
      </Card>
    );
  }

  if (orders === null) {
    return (
      <Card>
        <div role="status" aria-label={t('account.orders.loading')}>
          <ListSkeleton count={4} />
        </div>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="package" size={40} />}
          title={t('account.orders.emptyTitle')}
          description={t('account.orders.emptyDesc')}
          action={<Button onClick={() => appNavigate('/')}>{t('account.orders.emptyCta')}</Button>}
        />
      </Card>
    );
  }

  return (
    <div data-testid="orders-page">
      <h1 className="acc-page-title">{t('account.orders.title')}</h1>
      <div className="order-card-list">
        {orders.map((order) => (
          <Card key={order.id} className="order-card">
            <a
              href={`/account/orders/${order.id}`}
              onClick={(event) => {
                event.preventDefault();
                appNavigate(`/account/orders/${order.id}`);
              }}
              className="order-card__link"
            >
              <div className="order-card__row">
                <div>
                  <div className="order-card__id">
                    {t('account.orders.orderId', { id: order.id.slice(0, 8).toUpperCase() })}
                  </div>
                  <div className="order-card__meta">
                    {formatDateTime(order.createdAt)} · {t('account.orders.itemsCount', { count: order.itemsCount })} ·{' '}
                    {order.paymentMethod === 'stripe'
                      ? t('account.orders.paymentStripe')
                      : t('account.orders.paymentCod')}
                  </div>
                </div>
                <div className="order-card__side">
                  <StatusBadge status={order.status} />
                  <div className="order-card__total">{formatVnd(order.total)}</div>
                </div>
              </div>
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** SF-4 (FI-394 T1): side-nav layout bọc toàn bộ trạng thái page (kể cả loading/error). */
export default function OrdersPage(): ReactElement {
  return (
    <AccountLayout active="orders">
      <OrdersPageContent />
    </AccountLayout>
  );
}
