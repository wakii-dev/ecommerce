import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useT } from '@ecommerce/i18n';
import { Badge, Card, Skeleton, Table } from '@ecommerce/ui-kit';
import { orderingApi } from '../lib/api';
import { formatDateTime, formatVnd } from '../lib/format';

/**
 * Coupons LIVE READ-ONLY (SF-10): contract freeze (ordering.yaml) KHÔNG có
 * admin coupon CRUD — chỉ listPublicCoupons + validate-coupon (SF-9). Mock
 * CRUD của SF-7 mock-gate được THAY bằng danh sách thật (WELCOME10/GIAM50K
 * từ seed) + ghi chú giới hạn; tạo/sửa coupon hiện qua seed script / SQL cho
 * tới khi epic duyệt amendment contracts (REQUIREMENT-GAP nếu cần).
 */
interface PublicCoupon {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderValue?: number;
  startsAt?: string;
  endsAt?: string;
  description: string;
}

export default function CouponsPage(): ReactElement {
  const { t } = useT();

  const couponsQuery = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => (await orderingApi().listPublicCoupons({})) as PublicCoupon[]
  });

  const rows = couponsQuery.data ?? [];

  const columns = [
    {
      key: 'code',
      header: t('admin.coupons.code'),
      render: (row: PublicCoupon) => (
        <div>
          <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{row.code}</div>
          {row.description !== '' && <div className='admin-hint'>{row.description}</div>}
        </div>
      )
    },
    {
      key: 'type',
      header: t('admin.coupons.type'),
      render: (row: PublicCoupon) =>
        row.type === 'PERCENT' ? (
          <Badge variant='warning'>{t('admin.coupons.percent')}</Badge>
        ) : (
          <Badge variant='neutral'>{t('admin.coupons.fixed')}</Badge>
        )
    },
    {
      key: 'value',
      header: t('admin.coupons.value'),
      align: 'right' as const,
      render: (row: PublicCoupon) => (row.type === 'PERCENT' ? `${row.value}%` : formatVnd(row.value))
    },
    {
      key: 'min',
      header: t('admin.coupons.minOrder'),
      align: 'right' as const,
      render: (row: PublicCoupon) => (row.minOrderValue !== undefined ? formatVnd(row.minOrderValue) : '—')
    },
    {
      key: 'window',
      header: `${t('admin.coupons.startsAt')} → ${t('admin.coupons.endsAt')}`,
      render: (row: PublicCoupon) => (
        <span style={{ fontSize: 13 }}>
          {row.startsAt ? formatDateTime(row.startsAt) : '—'}
          {' → '}
          {row.endsAt ? formatDateTime(row.endsAt) : '—'}
        </span>
      )
    }
  ];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{t('admin.coupons.title')}</h1>
      </div>

      <Card>
        <p className='admin-hint' style={{ margin: '0 0 12px' }}>
          Read-only — coupon CRUD không thuộc contract freeze (ordering.yaml):
          tạo/sửa qua seed script (<code>make seed</code>) hoặc SQL tới khi có
          amendment contracts.
        </p>
        {couponsQuery.isLoading ? (
          <Skeleton variant='rect' height={200} />
        ) : (
          <Table columns={columns} rows={rows} rowKey={(row) => row.code} empty={t('admin.coupons.empty')} />
        )}
      </Card>
    </div>
  );
}
