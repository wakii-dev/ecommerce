import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, Card, Input, Select, Skeleton, Table } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { stubApi } from '../lib/api';
import { dayKeyOf, formatDateTime, formatVnd } from '../lib/format';
import type { OrderStatusValue, StubOrder } from '../lib/types';

const STATUSES: ReadonlyArray<OrderStatusValue> = [
  'PENDING',
  'PAID',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED'
];

const PAGE_SIZE = 10;

export function statusBadge(status: OrderStatusValue, t: (k: string) => string): ReactElement {
  const variant =
    status === 'DELIVERED' || status === 'CONFIRMED'
      ? 'success'
      : status === 'CANCELLED' || status === 'FAILED'
        ? 'danger'
        : status === 'SHIPPED' || status === 'PAID'
          ? 'primary'
          : 'warning';
  return <Badge variant={variant}>{t(`admin.status.${status}`)}</Badge>;
}

export default function OrdersPage(): ReactElement {
  const { t } = useT();

  const [status, setStatus] = useState<OrderStatusValue | ''>('');
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const ordersQuery = useQuery({
    queryKey: ['stub-orders'],
    queryFn: () => stubApi().listOrders()
  });

  // Lọc CLIENT-SIDE (mock trong bộ nhớ; list thật của ordering có status/q/page
  // — SF-10 wire live chuyển sang server params).
  const filtered = useMemo(() => {
    const list = ordersQuery.data ?? [];
    const qLower = q.trim().toLowerCase();
    return list.filter((order) => {
      if (status !== '' && order.status !== status) return false;
      if (qLower !== '') {
        const hay = `${order.id} ${order.userId} ${order.address.fullName} ${order.address.phone}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      const day = dayKeyOf(new Date(order.createdAt));
      if (fromDate !== '' && day < fromDate) return false;
      if (toDate !== '' && day > toDate) return false;
      return true;
    });
  }, [ordersQuery.data, status, q, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns = [
    {
      key: 'id',
      header: t('admin.orders.order'),
      render: (row: StubOrder) => (
        <div>
          <div style={{ fontWeight: 700 }}>#{row.id}</div>
          <div className='admin-hint'>{formatDateTime(row.createdAt)}</div>
        </div>
      )
    },
    {
      key: 'customer',
      header: t('admin.orders.customer'),
      render: (row: StubOrder) => (
        <div>
          <div>{row.address.fullName}</div>
          <div className='admin-hint'>{row.address.phone}</div>
        </div>
      )
    },
    {
      key: 'items',
      header: t('admin.orders.itemsCount'),
      align: 'right' as const,
      render: (row: StubOrder) => row.items.reduce((sum, l) => sum + l.qty, 0)
    },
    {
      key: 'total',
      header: t('admin.orders.total'),
      align: 'right' as const,
      render: (row: StubOrder) => <strong>{formatVnd(row.total)}</strong>
    },
    {
      key: 'payment',
      header: t('admin.orders.payment'),
      render: (row: StubOrder) =>
        row.paymentMethod === 'cod' ? (
          <Badge variant='neutral'>{t('admin.orders.paymentCod')}</Badge>
        ) : (
          <Badge variant='primary'>{t('admin.orders.paymentStripe')}</Badge>
        )
    },
    {
      key: 'status',
      header: t('admin.common.status'),
      render: (row: StubOrder) => statusBadge(row.status, t)
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: StubOrder) => (
        <Button size='sm' variant='secondary' onClick={() => appNavigate(`/admin/orders/${row.id}`)}>
          {t('admin.orders.detail')}
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>
          {t('admin.orders.title')} <span className='admin-badge-mock'>{t('admin.common.mock')}</span>
        </h1>
      </div>

      <div className='admin-filters'>
        <Input
          value={q}
          placeholder={t('admin.common.searchPh')}
          aria-label={t('admin.common.search')}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          style={{ width: 220 }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as OrderStatusValue | '');
          }}
          aria-label={t('admin.common.status')}
        >
          <option value=''>{t('admin.common.status')}: {t('admin.common.all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.status.${s}`)}
            </option>
          ))}
        </Select>
        <Input
          type='date'
          aria-label={`${t('admin.common.date')} — ${t('admin.common.from')}`}
          value={fromDate}
          onChange={(e) => {
            setPage(1);
            setFromDate(e.target.value);
          }}
        />
        <Input
          type='date'
          aria-label={`${t('admin.common.date')} — ${t('admin.common.to')}`}
          value={toDate}
          onChange={(e) => {
            setPage(1);
            setToDate(e.target.value);
          }}
        />
      </div>

      {ordersQuery.isLoading ? (
        <Skeleton variant='rect' height={200} />
      ) : (
        <Card>
          <Table columns={columns} rows={rows} rowKey={(row) => row.id} empty={t('admin.orders.empty')} />
        </Card>
      )}

      <div className='admin-pagination'>
        <Button size='sm' variant='secondary' disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ← {t('admin.common.prev')}
        </Button>
        <span>{t('admin.common.pageOf', { page, total: totalPages })}</span>
        <Button
          size='sm'
          variant='secondary'
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('admin.common.next')} →
        </Button>
      </div>
    </div>
  );
}
