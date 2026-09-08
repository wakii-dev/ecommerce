// pages/orders/OrderDetailPage.tsx — chi tiết đơn (SF-9 file-slice; SF-14 append;
// SF-4 FI-394 T6): items + địa chỉ + timeline trạng thái + Hủy đơn (PENDING,
// confirm dialog) + Tải hóa đơn PDF (CONFIRMED+ — D18)
// + Tracking vận đơn (SF-14 D22: GHN/flat) + Tạo yêu cầu trả hàng RMA.
// T6: 42 khối inline → class .od-* (page.css); items <table> tay → ui-kit Table;
// nút back ← → IconButton + Icon; i18n hard-code vi → account.order.*.
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  Modal,
  QuantityStepper,
  Table,
  Textarea
} from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { authStore } from '@ecommerce/auth';
import { AccountLayout } from '../../AccountLayout';
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

/** Map RMA status → suffix key account.order.rmaStatus.* (giá trị vi khớp
 *  RMA_STATUS_LABEL cũ: requested 'Chờ xử lý'… rejected 'Bị từ chối'). */
const RMA_STATUS_KEY: Record<string, string> = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  RECEIVED: 'received',
  REFUNDED: 'refunded',
  REJECTED: 'rejected'
};

function OrderDetailContent({ id }: { id: string }): ReactElement {
  const { t } = useT();
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
          setError(status === 404 ? t('account.order.notFound') : err instanceof Error ? err.message : t('account.order.errorGeneric'));
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
        setBanner(t('account.order.cancelSuccess'));
      })
      .catch((err: unknown) => {
        setConfirmCancel(false);
        setBanner(err instanceof Error ? err.message : t('account.order.cancelFail'));
      })
      .finally(() => setCancelling(false));
  };

  const onDownloadInvoice = (): void => {
    if (!order) return;
    setBanner(null);
    downloadInvoicePdf(order).catch((err: unknown) => {
      setBanner(err instanceof Error ? err.message : t('account.order.invoiceFail'));
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
      setRmaError(t('account.order.rmaErrorEmpty'));
      return;
    }
    if (!rmaReason.trim()) {
      setRmaError(t('account.order.rmaErrorReason'));
      return;
    }
    setRmaSubmitting(true);
    setRmaError(null);
    createRma(order.id, lines, rmaReason.trim())
      .then((rma) => {
        setRmas((prev) => [rma, ...prev]);
        setRmaModal(false);
        setBanner(t('account.order.rmaSuccess'));
      })
      .catch((err: unknown) => {
        setRmaError(err instanceof Error ? err.message : t('account.order.rmaFail'));
      })
      .finally(() => setRmaSubmitting(false));
  };

  if (error) {
    return (
      <Card>
        <p className="od-error__msg">{error}</p>
        <Button variant="secondary" className="od-error__back" onClick={() => appNavigate('/account/orders')}>
          {t('account.order.backToList')}
        </Button>
      </Card>
    );
  }

  if (!order) {
    return (
      <Card>
        <p className="od-loading">{t('account.order.loading')}</p>
      </Card>
    );
  }

  const invoiceAvailable = ['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const hasActiveRma = rmas.some((r) => r.status !== 'REFUNDED' && r.status !== 'REJECTED');
  const rmaStatusLabel = (status: string): string => {
    const key = RMA_STATUS_KEY[status];
    return key ? t(`account.order.rmaStatus.${key}`) : status;
  };

  return (
    <div data-testid="order-detail">
      <div className="od-head">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('account.order.backToList')}
          onClick={() => appNavigate('/account/orders')}
        >
          <Icon name="chevron-left" size={16} />
        </IconButton>
        <h1 className="od-title">{t('account.order.title', { id: order.id.slice(0, 8).toUpperCase() })}</h1>
        <StatusBadge status={order.status} />
      </div>

      {banner && (
        <Card className="od-banner">
          <span className="od-banner__text">{banner}</span>
        </Card>
      )}

      <div className="od-grid">
        <Card>
          <div className="od-meta-row">
            <div>
              <div>{t('account.order.orderedAt', { at: formatDateTime(order.createdAt) })}</div>
              <div className="od-meta-detail">
                {t('account.order.payment')}: {order.paymentMethod === 'stripe' ? 'Stripe' : 'COD'} ·{' '}
                {t('account.order.shipping')}:{' '}
                {order.shippingMethod === 'express' ? t('account.order.shippingExpress') : t('account.order.shippingStd')}
                {order.trackingCode ? ` · ${t('account.order.trackingCode')}: ${order.trackingCode}` : ''}
              </div>
            </div>
            <div className="od-meta-actions">
              {invoiceAvailable && (
                <Button className="od-btn-icon" onClick={onDownloadInvoice}>
                  <Icon name="external" size={16} />
                  {t('account.order.invoice')}
                </Button>
              )}
              {order.status === 'DELIVERED' && !hasActiveRma && (
                <Button variant="secondary" className="od-btn-icon" data-testid="rma-create" onClick={openRmaModal}>
                  <Icon name="package" size={16} />
                  {t('account.order.rmaCreate')}
                </Button>
              )}
              {order.status === 'PENDING' && (
                <Button variant="danger" onClick={() => setConfirmCancel(true)}>{t('account.order.cancel')}</Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="od-section-title">{t('account.order.items')}</h2>
          <Table
            columns={[
              { key: 'name', header: t('account.order.items') },
              { key: 'qty', header: t('account.order.qty'), align: 'center', render: (item) => `×${item.qty}` },
              {
                key: 'lineTotal',
                header: t('account.order.lineTotal'),
                align: 'right',
                render: (item) => formatVnd(item.lineTotal)
              }
            ]}
            rows={order.items}
            rowKey={(item) => item.id}
          />
          <div className="od-totals">
            <span>{t('account.order.subtotal')}: {formatVnd(order.subtotal)}</span>
            {order.discount > 0 && (
              <span>
                {t('account.order.discount')}{order.couponCode ? ` (${order.couponCode})` : ''}: −{formatVnd(order.discount)}
              </span>
            )}
            {!!order.pointsDiscount && order.pointsDiscount > 0 && (
              <span data-testid="points-discount">{t('account.order.pointsDiscount')}: −{formatVnd(order.pointsDiscount)}</span>
            )}
            <span>{t('account.order.shippingFee')}: {formatVnd(order.shippingFee)}</span>
            <span className="od-totals__total">
              {t('account.order.total')}: <span className="od-totals__amount">{formatVnd(order.total)}</span>
            </span>
          </div>
        </Card>

        <Card>
          <h2 className="od-section-title">{t('account.order.address')}</h2>
          <div>{order.address.fullName} · {order.address.phone}</div>
          <div className="od-address">
            {[order.address.line1, order.address.ward, order.address.district, order.address.city]
              .filter(Boolean)
              .join(', ')}
          </div>
        </Card>

        <Card>
          <h2 className="od-section-title">{t('account.order.shippingSection')}</h2>
          {tracking ? (
            <div data-testid="tracking-block">
              <div>
                {t('account.order.trackingCode')}: <strong>{tracking.trackingCode}</strong> ·{' '}
                {t('account.order.carrierLabel')}:{' '}
                {tracking.carrier === 'flat' ? t('account.order.trackingCarrierFlat') : tracking.carrier} ·{' '}
                {t('account.order.statusLabel')}:{' '}
                {tracking.status === 'delivered'
                  ? t('account.order.trackingStatusDelivered')
                  : tracking.status === 'in_transit'
                    ? t('account.order.trackingStatusTransit')
                    : t('account.order.trackingStatusPreparing')}
              </div>
              {tracking.events && tracking.events.length > 0 && (
                <ol className="od-timeline">
                  {tracking.events.map((event, index) => (
                    <li key={`${event.at}-${index}`} className="od-timeline__item--primary">
                      <span className="od-timeline__dot" aria-hidden="true" />
                      <span className="od-timeline__time">{event.at}</span>
                      <span className="od-timeline__desc">{event.description}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div className="od-address">
              {order.trackingCode
                ? `${t('account.order.trackingCode')}: ${order.trackingCode}`
                : t('account.order.noTracking')}
            </div>
          )}
        </Card>

        {rmas.length > 0 && (
          <Card>
            <h2 className="od-section-title">{t('account.order.rmaSection')}</h2>
            <div className="od-rma-list" data-testid="rma-list">
              {rmas.map((rma) => (
                <div key={rma.id} className="od-rma-row">
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
                  <span className="od-rma-meta">
                    {t('account.order.rmaSummary', { count: rma.lines.reduce((sum, line) => sum + line.qty, 0) })} · “
                    {rma.reason}”
                    {rma.refundAmount ? ` · ${t('account.order.refund', { amount: formatVnd(rma.refundAmount) })}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h2 className="od-section-title">{t('account.order.timeline')}</h2>
          <ol className="od-timeline">
            {order.timeline.map((entry, index) => {
              // Mốc hoàn thành: trạng thái terminal (DELIVERED/CANCELLED) hoặc
              // entry cuối cùng (mới nhất) → dot --c-success; còn lại --c-border.
              const terminal = entry.status === 'DELIVERED' || entry.status === 'CANCELLED';
              const done = terminal || index === order.timeline.length - 1;
              return (
                <li key={`${entry.status}-${index}`} className={done ? 'od-timeline__item--success' : undefined}>
                  <span className="od-timeline__dot" aria-hidden="true" />
                  <span className="od-timeline__time">{formatDateTime(entry.at)}</span>
                  <StatusBadge status={entry.status} />
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t('account.order.cancelModalTitle')}
        footer={
          <div className="od-modal-footer">
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              {t('account.order.keepOrder')}
            </Button>
            <Button variant="danger" disabled={cancelling} onClick={onCancelConfirmed}>
              {cancelling ? t('account.order.cancelling') : t('account.order.confirmCancel')}
            </Button>
          </div>
        }
      >
        <p className="od-modal-text">
          {t('account.order.cancelModalBody', { id: order.id.slice(0, 8).toUpperCase() })}
        </p>
      </Modal>

      {/* SF-14 (D22): tạo yêu cầu trả hàng — chọn món + số lượng + lý do */}
      <Modal
        open={rmaModal}
        onClose={() => setRmaModal(false)}
        title={t('account.order.rmaModalTitle')}
        footer={
          <div className="od-modal-footer">
            <Button variant="secondary" onClick={() => setRmaModal(false)}>
              {t('account.order.close')}
            </Button>
            <Button variant="primary" disabled={rmaSubmitting} data-testid="rma-submit" onClick={submitRma}>
              {rmaSubmitting ? t('account.order.rmaSubmitting') : t('account.order.rmaSubmit')}
            </Button>
          </div>
        }
      >
        <div className="od-rma-form">
          <div>
            {order.items.map((item) => (
              <div key={item.id} className="od-rma-item">
                <span>
                  {item.name} <span className="od-rma-item__qty">×{item.qty}</span>
                </span>
                {/* min 0 (KHÔNG forced min 1 — cho phép bỏ chọn món), max = qty
                    của món; clamp 0..item.qty do QuantityStepper tự xử lý. */}
                <QuantityStepper
                  min={0}
                  max={item.qty}
                  value={rmaQty[item.id] ?? 0}
                  label={t('account.order.rmaQty', { name: item.name })}
                  onChange={(next) => setRmaQty((prev) => ({ ...prev, [item.id]: next }))}
                />
              </div>
            ))}
          </div>
          <Textarea
            label={t('account.order.rmaReason')}
            placeholder={t('account.order.rmaReasonPlaceholder')}
            value={rmaReason}
            rows={3}
            maxLength={500}
            hint={t('account.order.rmaCount', { count: rmaReason.length })}
            error={rmaError === t('account.order.rmaErrorReason') ? rmaError : undefined}
            onChange={(e) => setRmaReason(e.target.value)}
          />
          {/* Lỗi chọn-số-lượng / lỗi API → block role=alert riêng (error prop
              Textarea chỉ nhận lỗi liên quan lý do). */}
          {rmaError && rmaError !== t('account.order.rmaErrorReason') && (
            <p role="alert" className="od-rma-error">{rmaError}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** SF-4 (FI-394 T1): side-nav layout bọc toàn bộ trạng thái page (kể cả loading/error). */
export default function OrderDetailPage({ id }: { id: string }): ReactElement {
  return (
    <AccountLayout active="orders">
      <OrderDetailContent id={id} />
    </AccountLayout>
  );
}
