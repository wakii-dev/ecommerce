import { useState } from 'react';
import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, Card, Modal, Skeleton, useToast } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { orderingApi } from '../lib/api';
import { downloadAdminInvoice } from '../lib/invoice';
import { formatDateTime, formatVnd } from '../lib/format';
import { canCancel, canDeliver, canShip } from '../lib/orderRules';
import type { AdminOrder } from '../lib/types';
import { statusBadge } from './OrdersPage';

export interface OrderDetailPageProps {
  id: string;
}

export default function OrderDetailPage({ id }: OrderDetailPageProps): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['admin-orders', 'detail', id],
    queryFn: async () => (await orderingApi().adminGetOrder({ id })) as unknown as AdminOrder
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
  };

  const transition = useMutation({
    mutationFn: ({ action }: { action: 'ship' | 'deliver' | 'cancel' }) => {
      if (action === 'ship') return orderingApi().adminShipOrder({ id });
      if (action === 'deliver') return orderingApi().adminDeliverOrder({ id });
      return orderingApi().adminCancelOrder({ id });
    },
    onSuccess: (_data, vars) => {
      invalidate();
      toast.toast(
        vars.action === 'ship'
          ? t('admin.orders.shipped')
          : vars.action === 'deliver'
            ? t('admin.orders.delivered')
            : t('admin.orders.cancelled'),
        { variant: 'success' }
      );
      setConfirmingCancel(false);
    },
    onError: (error) => {
      // INVALID_TRANSITION — hiện message chặn, KHÔNG đổi state (state machine §3.6).
      const invalid = String(error).includes('INVALID_TRANSITION');
      toast.toast(invalid ? t('admin.orders.invalidTransition') : String(error), {
        variant: 'danger'
      });
      setConfirmingCancel(false);
    }
  });

  const onDownloadInvoice = async (): Promise<void> => {
    // SF-10 (D18): PDF thật từ ordering (409 khi chưa CONFIRMED — hiện detail)
    try {
      await downloadAdminInvoice(id);
      toast.toast(t('admin.orders.invoiceDone'), { variant: 'success' });
    } catch (error) {
      toast.toast(error instanceof Error ? error.message : String(error), { variant: 'danger' });
    }
  };

  if (orderQuery.isLoading) {
    return <Skeleton variant='rect' height={320} />;
  }
  const order = orderQuery.data;
  if (!order) {
    return <p className='admin-error-text'>{t('admin.common.notFound')}</p>;
  }

  const address = order.address;

  return (
    <div>
      <div className='admin-page-head'>
        <h1>
          {t('admin.orders.detail')} #{order.id} {statusBadge(order.status, t)}
        </h1>
        <div className='admin-page-head__actions'>
          <Button variant='ghost' onClick={() => appNavigate('/admin/orders')}>
            ← {t('admin.orders.title')}
          </Button>
          <Button variant='secondary' onClick={() => void onDownloadInvoice()}>
            ⬇ {t('admin.orders.invoice')}
          </Button>
          {/* State machine §3.6 — ship/deliver/cancel, KHÔNG có nút confirm
              (PENDING→PAID là webhook Stripe, không phải admin action). */}
          {canShip(order.status) && (
            <Button disabled={transition.isPending} onClick={() => transition.mutate({ action: 'ship' })}>
              🚚 {t('admin.orders.ship')}
            </Button>
          )}
          {canDeliver(order.status) && (
            <Button disabled={transition.isPending} onClick={() => transition.mutate({ action: 'deliver' })}>
              ✓ {t('admin.orders.deliver')}
            </Button>
          )}
          {canCancel(order.status) && (
            <Button
              variant='danger-soft' /* §3 nút hủy admin: outline tint pill CANCELLED */
              disabled={transition.isPending}
              onClick={() => setConfirmingCancel(true)}
            >
              ✕ {t('admin.orders.cancel')}
            </Button>
          )}
        </div>
      </div>

      <div className='admin-order-grid'>
        <Card>
          <h3>{t('admin.orders.items')}</h3>
          <table className='uk-table'>
            <thead>
              <tr>
                <th>{t('admin.orders.items')}</th>
                <th className='uk-table__right'>{t('admin.orders.total')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((line) => (
                <tr key={line.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{line.name}</div>
                    <div className='admin-hint'>
                      {line.qty} × {formatVnd(line.unitPrice)}
                    </div>
                  </td>
                  <td className='uk-table__right'>{formatVnd(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className='admin-order-totals'>
            <div>
              <span>{t('admin.orders.subtotal')}:</span>
              <span>{formatVnd(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div>
                <span>
                  {t('admin.orders.couponCode')}
                  {order.couponCode ? ` (${order.couponCode})` : ''}:
                </span>
                <span>−{formatVnd(order.discount)}</span>
              </div>
            )}
            <div>
              <span>
                {t('admin.orders.shipping')} ({order.shippingMethod}):
              </span>
              <span>{formatVnd(order.shippingFee)}</span>
            </div>
            <div style={{ fontWeight: 800 }}>
              <span>{t('admin.orders.total')}:</span>
              <span>{formatVnd(order.total)}</span>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Badge variant={order.paymentMethod === 'cod' ? 'neutral' : 'primary'}>
              {order.paymentMethod === 'cod' ? t('admin.orders.paymentCod') : t('admin.orders.paymentStripe')}
            </Badge>
            {order.affiliateCode !== undefined && (
              <Badge variant='warning'>
                {t('admin.orders.affiliateCode')}: {order.affiliateCode}
              </Badge>
            )}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <h3>{t('admin.orders.address')}</h3>
            <div>
              <div style={{ fontWeight: 600 }}>{address.fullName}</div>
              <div>{t('admin.orders.phone')}: {address.phone}</div>
              <div>{address.line1}</div>
              <div className='admin-hint'>
                {address.ward}, {address.district}, {address.city}
              </div>
            </div>
          </Card>
          <Card>
            <h3>{t('admin.orders.timeline')}</h3>
            <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...order.timeline].reverse().map((event, i) => (
                <li key={i}>
                  <div style={{ fontSize: 13 }}>{t(`admin.status.${event.status}`)}</div>
                  <div className='admin-hint'>{formatDateTime(event.at)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Modal open={confirmingCancel} onClose={() => setConfirmingCancel(false)} title={t('admin.orders.cancel')}>
        <p>{t('admin.orders.cancelConfirm')}</p>
        <p style={{ fontWeight: 700 }}>#{order.id}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant='ghost' onClick={() => setConfirmingCancel(false)}>
            {t('admin.common.no')}
          </Button>
          <Button variant='danger' disabled={transition.isPending} onClick={() => transition.mutate({ action: 'cancel' })}>
            {t('admin.orders.cancel')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
