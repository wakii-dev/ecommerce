// pages/orders/OrderDetailPage.tsx — chi tiết đơn (SF-9 file-slice; SF-14 append):
// items + địa chỉ + timeline trạng thái + Hủy đơn (PENDING, confirm dialog)
// + Tải hóa đơn PDF (CONFIRMED+ — D18)
// + Tracking vận đơn (SF-14 D22: GHN/flat) + Tạo yêu cầu trả hàng RMA.
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Badge, Button, Card, Modal } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';
import { appNavigate, authReady } from '../../bootstrap';
import { StatusBadge, formatDateTime, formatVnd } from './OrdersPage';
import {
  cancelMyOrder,
  createRma,
  downloadInvoicePdf,
  fetchMyOrder,
  fetchMyRmas,
  fetchOrderTracking,
  type Order,
  type Rma,
  type TrackingResponse
} from './ordersApi';

const RMA_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Chờ xử lý',
  APPROVED: 'Đã duyệt',
  RECEIVED: 'Đã nhận hàng',
  REFUNDED: 'Đã hoàn tiền',
  REJECTED: 'Bị từ chối'
};

export default function OrderDetailPage({ id }: { id: string }): ReactElement {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // SF-14: tracking + RMA
  const [tracking, setTracking] = useState<TrackingResponse | null>(null);
  const [rmas, setRmas] = useState<Rma[]>([]);
  const [rmaModal, setRmaModal] = useState(false);
  const [rmaQty, setRmaQty] = useState<Record<string, number>>({});
  const [rmaReason, setRmaReason] = useState('');
  const [rmaError, setRmaError] = useState<string | null>(null);
  const [rmaSubmitting, setRmaSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    authReady.then(() => {
      if (!alive) return;
      if (!authStore.isAuthenticated()) {
        appNavigate('/login');
        return;
      }
      fetchMyOrder(id)
        .then((o) => {
          if (!alive) return;
          setOrder(o);
          // SF-14: tracking khi đơn đang/đã giao
          if ((o.status === 'SHIPPED' || o.status === 'DELIVERED') && o.trackingCode) {
            fetchOrderTracking(o.id).then((tr) => alive && setTracking(tr)).catch(() => undefined);
          }
          fetchMyRmas()
            .then((page) => alive && setRmas(page.items.filter((r) => r.orderId === o.id)))
            .catch(() => undefined);
        })
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

  // ── SF-14: tạo RMA ────────────────────────────────────────────────────────
  const openRmaModal = (): void => {
    if (!order) return;
    setRmaQty(Object.fromEntries(order.items.map((item) => [item.id, 0])));
    setRmaReason('');
    setRmaError(null);
    setRmaModal(true);
  };

  const submitRma = (): void => {
    if (!order) return;
    const lines = Object.entries(rmaQty)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, qty]) => ({ lineId, qty }));
    if (lines.length === 0) {
      setRmaError('Chọn ít nhất 1 sản phẩm muốn trả');
      return;
    }
    if (!rmaReason.trim()) {
      setRmaError('Nhập lý do trả hàng');
      return;
    }
    setRmaSubmitting(true);
    setRmaError(null);
    createRma(order.id, lines, rmaReason.trim())
      .then((rma) => {
        setRmas((prev) => [rma, ...prev]);
        setRmaModal(false);
        setBanner('Đã gửi yêu cầu trả hàng — chờ quản trị viên duyệt. Xem tiến trình bên dưới.');
      })
      .catch((err: unknown) => {
        setRmaError(err instanceof Error ? err.message : 'Không tạo được yêu cầu trả hàng');
      })
      .finally(() => setRmaSubmitting(false));
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
  const hasActiveRma = rmas.some((r) => r.status !== 'REFUNDED' && r.status !== 'REJECTED');
  const rmaStatusLabel = (status: string): string => RMA_STATUS_LABEL[status] ?? status;

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
              {order.status === 'DELIVERED' && !hasActiveRma && (
                <Button variant="secondary" data-testid="rma-create" onClick={openRmaModal}>
                  Trả hàng / hoàn tiền
                </Button>
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
            {!!order.pointsDiscount && order.pointsDiscount > 0 && (
              <span data-testid="points-discount">Điểm thưởng: −{formatVnd(order.pointsDiscount)}</span>
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
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Vận chuyển</h2>
          {tracking ? (
            <div data-testid="tracking-block">
              <div>
                Mã vận đơn: <strong>{tracking.trackingCode}</strong> · Đơn vị:{' '}
                {tracking.carrier === 'flat' ? 'Giao hàng tiêu chuẩn' : tracking.carrier} · Trạng
                thái: {tracking.status === 'delivered' ? 'Đã giao' : tracking.status === 'in_transit' ? 'Đang vận chuyển' : 'Đang chuẩn bị'}
              </div>
              {tracking.events && tracking.events.length > 0 && (
                <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                  {tracking.events.map((event, index) => (
                    <li key={`${event.at}-${index}`} style={{ fontSize: 'var(--text-sm, 13px)' }}>
                      {event.at && <Badge variant="neutral">{event.at}</Badge>} {event.description}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--c-text-secondary, #666)' }}>
              {order.trackingCode
                ? `Mã vận đơn: ${order.trackingCode}`
                : 'Chưa có mã vận đơn — hiển thị sau khi shop đóng gói.'}
            </div>
          )}
        </Card>

        {rmas.length > 0 && (
          <Card>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Yêu cầu trả hàng</h2>
            <div style={{ display: 'grid', gap: 10 }} data-testid="rma-list">
              {rmas.map((rma) => (
                <div
                  key={rma.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    borderTop: '1px solid var(--c-border, #EEE)',
                    paddingTop: 8
                  }}
                >
                  <Badge
                    variant={
                      rma.status === 'REFUNDED'
                        ? 'success'
                        : rma.status === 'REJECTED'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {rmaStatusLabel(rma.status)}
                  </Badge>
                  <span style={{ fontSize: 'var(--text-sm, 13px)' }}>
                    {rma.lines.reduce((sum, line) => sum + line.qty, 0)} món · “{rma.reason}”
                    {rma.refundAmount ? ` · hoàn ${formatVnd(rma.refundAmount)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

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

      {/* SF-14 (D22): tạo yêu cầu trả hàng — chọn món + số lượng + lý do */}
      <Modal
        open={rmaModal}
        onClose={() => setRmaModal(false)}
        title="Tạo yêu cầu trả hàng"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setRmaModal(false)}>Đóng</Button>
            <Button variant="primary" disabled={rmaSubmitting} data-testid="rma-submit" onClick={submitRma}>
              {rmaSubmitting ? 'Đang gửi…' : 'Gửi yêu cầu'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            {order.items.map((item) => (
              <div
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', justifyContent: 'space-between' }}
              >
                <span>
                  {item.name} <span style={{ color: 'var(--c-text-secondary, #666)' }}>×{item.qty}</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={item.qty}
                  value={rmaQty[item.id] ?? 0}
                  aria-label={`Số lượng trả ${item.name}`}
                  style={{ width: 64, padding: '4px 6px' }}
                  onChange={(e) =>
                    setRmaQty((prev) => ({
                      ...prev,
                      [item.id]: Math.max(0, Math.min(item.qty, Number(e.target.value) || 0))
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <textarea
            placeholder="Lý do trả hàng (sai mẫu, lỗi sản phẩm…) — trong 7 ngày kể từ khi nhận hàng"
            value={rmaReason}
            rows={3}
            aria-label="Lý do trả hàng"
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            onChange={(e) => setRmaReason(e.target.value)}
          />
          {rmaError && (
            <p role="alert" style={{ margin: 0, color: 'var(--c-danger, #d63a2f)' }}>{rmaError}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
