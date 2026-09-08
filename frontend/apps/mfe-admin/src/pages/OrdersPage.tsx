import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, Input, Select } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { downloadAdminFile } from '../lib/download';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { orderingApi } from '../lib/api';
import { dayKeyOf, formatDateTime, formatVnd } from '../lib/format';
import type { OrderStatusValue, AdminOrder } from '../lib/types';

const STATUSES: ReadonlyArray<OrderStatusValue> = [
  'PENDING',
  'PAID',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED'
];

/** Pill trạng thái §1.7 — palette --pill-* riêng từng enum (6 màu), FAILED
 * chung family CANCELLED (danger). Thay Badge generic 4 màu trước đây. */
export function statusBadge(status: OrderStatusValue, t: (k: string) => string): ReactElement {
  return <span className={`admin-pill admin-pill--${status}`}>{t(`admin.status.${status}`)}</span>;
}

/**
 * Orders LIVE (SF-10): adminListOrders server params status/q/page (comment
 * mock-gate SF-7: "list thật của ordering có status/q/page — SF-10 wire live
 * chuyển sang server params"). Date range KHÔNG có trên contract → lọc
 * client-side TRÊN TRANG HIỆN TẠI (limitation đã ghi chú — không thêm
 * endpoint vì contracts READ-ONLY).
 */
export default function OrdersPage(): ReactElement {
  const { t } = useT();

  const [status, setStatus] = useState<OrderStatusValue | ''>('');
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const ordersQuery = useQuery({
    queryKey: ['admin-orders', status, q.trim(), page, pageSize],
    queryFn: async () => {
      const res = await orderingApi().adminListOrders({
        ...(status ? { status } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        page,
        size: pageSize
      });
      return res as { items: AdminOrder[]; page: number; size: number; total: number };
    }
  });

  // date-range lọc trên trang hiện tại (contract không có date param)
  const rows = useMemo(() => {
    const list = ordersQuery.data?.items ?? [];
    if (fromDate === '' && toDate === '') return list;
    return list.filter((order) => {
      const day = dayKeyOf(new Date(order.createdAt));
      if (fromDate !== '' && day < fromDate) return false;
      if (toDate !== '' && day > toDate) return false;
      return true;
    });
  }, [ordersQuery.data, fromDate, toDate]);

  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = [
    {
      key: 'id',
      header: t('admin.orders.order'),
      sortValue: (row: AdminOrder) => row.id,
      render: (row: AdminOrder) => (
        <div>
          <div className='admin-order-code'>#{row.id.slice(0, 8)}</div>
          <div className='admin-hint'>{formatDateTime(row.createdAt)}</div>
        </div>
      )
    },
    {
      key: 'customer',
      header: t('admin.orders.customer'),
      sortValue: (row: AdminOrder) => row.address.fullName,
      render: (row: AdminOrder) => (
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
      sortValue: (row: AdminOrder) => row.items.reduce((sum, l) => sum + l.qty, 0),
      render: (row: AdminOrder) => row.items.reduce((sum, l) => sum + l.qty, 0)
    },
    {
      key: 'total',
      header: t('admin.orders.total'),
      align: 'right' as const,
      sortValue: (row: AdminOrder) => row.total,
      render: (row: AdminOrder) => <strong className='admin-money'>{formatVnd(row.total)}</strong>
    },
    {
      key: 'payment',
      header: t('admin.orders.payment'),
      render: (row: AdminOrder) =>
        row.paymentMethod === 'cod' ? (
          <Badge variant='neutral'>{t('admin.orders.paymentCod')}</Badge>
        ) : (
          <Badge variant='primary'>{t('admin.orders.paymentStripe')}</Badge>
        )
    },
    {
      key: 'status',
      header: t('admin.common.status'),
      sortValue: (row: AdminOrder) => row.status,
      render: (row: AdminOrder) => statusBadge(row.status, t)
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: AdminOrder) => (
        <Button size='sm' variant='secondary' onClick={() => appNavigate(`/admin/orders/${row.id}`)}>
          {t('admin.orders.detail')}
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{t('admin.orders.title')}</h1>
        <div className='admin-page-head__actions'>
          <Button
            variant='secondary'
            onClick={() => void downloadAdminFile('/api/ordering/admin/orders/export.csv', 'orders.csv')}
            data-testid='orders-export-csv'
          >
            {t('admin.orders.exportCsv')}
          </Button>
        </div>
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
        <PageSizeSelect
          value={pageSize}
          onChange={(n) => {
            setPage(1);
            setPageSize(n);
          }}
          label={t('admin.common.pageSize')}
        />
      </div>

      {ordersQuery.isLoading ? (
        <DataTable loading columns={columns} rows={[]} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={t('admin.orders.empty')}
        />
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
