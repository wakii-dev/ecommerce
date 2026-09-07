// pages/orders/OrderDetailPage.tsx — chi tiết đơn (SF-9 file-slice):
// items + địa chỉ + timeline trạng thái + Hủy đơn (PENDING, confirm dialog)
// + Tải hóa đơn PDF (CONFIRMED+ — D18).
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Badge, Button, Card, Modal } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';
import { appNavigate, authReady } from '../../bootstrap';
import { StatusBadge, formatDateTime, formatVnd } from './OrdersPage';
import { cancelMyOrder, downloadInvoicePdf, fetchMyOrder, type Order } from './ordersApi';

export default function OrderDetailPage({ id }: { id: string }): ReactElement {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    authReady.then(() => {
      if (!alive) return;
      if (!authStore.isAuthenticated()) {
        appNavigate('/login');
        return;
      }
      fetchMyOrder(id)
        .then((o) => alive && setOrder(o))
        .catch((err: unknown) => {
          if (!alive) return;
          const status = (err as { status?: number }).status;
          setError(status === 404 ? 'Không tìm thấy đơn hàng' : err instanceof Error ? err.message : 'Có lỗi xảy ra');
        });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const onCancelConfirmed = (): void => {
    setCancelling(true);
    setBanner(null);
    cancelMyOrder(id)
      .then((updated) => {
        setOrder(updated);
        setConfirmCancel(false);
        setBanner('Đã hủy đơn — tồn kho và mã giảm giá (nếu có) sẽ được hoàn lại.');
      })
      .catch((err: unknown) => {
        setConfirmCancel(false);
        setBanner(err instanceof Error ? err.message : 'Hủy đơn thất bại');
      })
      .finally(() => setCancelling(false));
  };

  const onDownloadInvoice = (): void => {
    if (!order) return;
    setBanner(null);
    downloadInvoicePdf(order).catch((err: unknown) => {
      setBanner(err instanceof Error ? err.message : 'Tải hóa đơn thất bại');
    });
  };

  if (error) {
    return (
      <Card>
        <p style={{ margin: 0 }}>{error}</p>
        <Button variant="secondary" onClick={() => appNavigate('/account/orders')} style={{ marginTop: 12 }}>
          ← Về danh sách đơn
        </Button>
      </Card>
    );
  }

  if (!order) {
    return (
      <Card>
        <p style={{ margin: 0, color: 'var(--c-text-secondary, #666)' }}>Đang tải đơn hàng…</p>
      </Card>
    );
  }

  const invoiceAvailable = ['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status);

  return (
    <div data-testid="order-detail">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Button variant="ghost" onClick={() => appNavigate('/account/orders')}>←</Button>
        <h1 style={{ margin: 0, flex: 1 }}>Đơn #{order.id.slice(0, 8).toUpperCase()}</h1>
        <StatusBadge status={order.status} />
      </div>

      {banner && (
        <Card style={{ marginBottom: 12 }}>
          <span style={{ color: 'var(--c-text-secondary, #555)' }}>{banner}</span>
        </Card>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-3, 12px)' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div>Đặt lúc {formatDateTime(order.createdAt)}</div>
              <div style={{ color: 'var(--c-text-secondary, #666)', fontSize: 'var(--text-sm, 13px)' }}>
                Thanh toán: {order.paymentMethod === 'stripe' ? 'Stripe' : 'COD'} · Vận chuyển:{' '}
                {order.shippingMethod === 'express' ? 'Giao hàng nhanh' : 'Giao hàng tiêu chuẩn'}
                {order.trackingCode ? ` · Mã vận đơn: ${order.trackingCode}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {invoiceAvailable && (
                <Button onClick={onDownloadInvoice}>Tải hóa đơn PDF</Button>
              )}
              {order.status === 'PENDING' && (
                <Button variant="danger" onClick={() => setConfirmCancel(true)}>Hủy đơn</Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Sản phẩm</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-md, 14px)' }}>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--c-border, #EEE)' }}>
                  <td style={{ padding: '8px 4px' }}>{item.name}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>×{item.qty}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatVnd(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'grid', gap: 4, justifyItems: 'end', fontSize: 'var(--text-md, 14px)' }}>
            <span>Tạm tính: {formatVnd(order.subtotal)}</span>
            {order.discount > 0 && (
              <span>
                Giảm giá{order.couponCode ? ` (${order.couponCode})` : ''}: −{formatVnd(order.discount)}
              </span>
            )}
            <span>Phí vận chuyển: {formatVnd(order.shippingFee)}</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              Tổng cộng: <span style={{ color: 'var(--c-primary, #F53D2D)' }}>{formatVnd(order.total)}</span>
            </span>
          </div>
        </Card>

        <Card>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Địa chỉ nhận hàng</h2>
          <div>{order.address.fullName} · {order.address.phone}</div>
          <div style={{ color: 'var(--c-text-secondary, #666)' }}>
            {[order.address.line1, order.address.ward, order.address.district, order.address.city]
              .filter(Boolean)
              .join(', ')}
          </div>
        </Card>

        <Card>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Tiến trình đơn hàng</h2>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {order.timeline.map((entry, index) => (
              <li key={`${entry.status}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge variant="neutral">{formatDateTime(entry.at)}</Badge>
                <StatusBadge status={entry.status} />
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Hủy đơn hàng?"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Giữ đơn</Button>
            <Button variant="danger" disabled={cancelling} onClick={onCancelConfirmed}>
              {cancelling ? 'Đang hủy…' : 'Hủy đơn'}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0 }}>
          Đơn #{order.id.slice(0, 8).toUpperCase()} chưa được thanh toán. Hủy xong tồn kho sẽ được nhả lại
          và bạn không thể hoàn tác.
        </p>
      </Modal>
    </div>
  );
}
