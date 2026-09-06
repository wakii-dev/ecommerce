// pages/orders/OrdersPage.tsx — my-orders list (SF-9 file-slice).
// Đơn thật từ ordering qua gateway: status badge màu theo trạng thái, ngày
// vi-VN, total VND, empty state + CTA về trang chủ.
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Badge, Button, Card, EmptyState } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';
import { appNavigate, authReady } from '../../bootstrap';
import { fetchMyOrders, type OrderStatus, type OrderSummary } from './ordersApi';

/** Badge màu theo trạng thái — bảng màu khớp ngữ nghĩa (xanh=tiến triển tốt). */
const STATUS_META: Record<OrderStatus, { label: string; variant: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Chờ thanh toán', variant: 'warning' },
  PAID: { label: 'Đã thanh toán', variant: 'primary' },
  CONFIRMED: { label: 'Đã xác nhận', variant: 'success' },
  SHIPPED: { label: 'Đang giao', variant: 'primary' },
  DELIVERED: { label: 'Đã giao', variant: 'success' },
  CANCELLED: { label: 'Đã hủy', variant: 'neutral' },
  FAILED: { label: 'Thất bại', variant: 'danger' }
};

export function StatusBadge({ status }: { status: OrderStatus }): ReactElement {
  const meta = STATUS_META[status] ?? { label: status, variant: 'neutral' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
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

export default function OrdersPage(): ReactElement {
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
        .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Có lỗi xảy ra'));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <EmptyState
          icon="⚠️"
          title="Không tải được đơn hàng"
          description={error}
          action={<Button onClick={() => window.location.reload()}>Thử lại</Button>}
        />
      </Card>
    );
  }

  if (orders === null) {
    return (
      <Card>
        <p style={{ margin: 0, color: 'var(--c-text-secondary, #666)' }}>Đang tải đơn hàng…</p>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="🛍️"
          title="Bạn chưa có đơn hàng nào"
          description="Khám phá hàng ngàn sản phẩm đang khuyến mãi hot."
          action={<Button onClick={() => appNavigate('/')}>Tiếp tục mua sắm</Button>}
        />
      </Card>
    );
  }

  return (
    <div data-testid="orders-page">
      <h1 style={{ marginTop: 0 }}>Đơn hàng của tôi</h1>
      <div style={{ display: 'grid', gap: 'var(--space-3, 12px)' }}>
        {orders.map((order) => (
          <Card key={order.id}>
            <a
              href={`/account/orders/${order.id}`}
              onClick={(event) => {
                event.preventDefault();
                appNavigate(`/account/orders/${order.id}`);
              }}
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Đơn #{order.id.slice(0, 8).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm, 13px)', color: 'var(--c-text-secondary, #666)' }}>
                    {formatDateTime(order.createdAt)} · {order.itemsCount} sản phẩm ·{' '}
                    {order.paymentMethod === 'stripe' ? 'Stripe' : 'COD'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <StatusBadge status={order.status} />
                  <div style={{ fontWeight: 700, color: 'var(--c-primary, #F53D2D)' }}>
                    {formatVnd(order.total)}
                  </div>
                </div>
              </div>
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
