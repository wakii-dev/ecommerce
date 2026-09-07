import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useT } from '@ecommerce/i18n';
import { Badge, Card, EmptyState, Skeleton, Table } from '@ecommerce/ui-kit';
import { inventoryApi, orderingApi } from '../lib/api';
import { formatVnd } from '../lib/format';
import type { StubRevenueDay, StubSummary } from '../lib/types';

/** Định dạng trục giá rút gọn: 2.400.000 → 2,4tr (trục, không phải tiền tệ). */
function axisVnd(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function KpiTile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <Card className='admin-kpi'>
      <div className='admin-kpi__label'>{label}</div>
      <div className='admin-kpi__value'>{value}</div>
    </Card>
  );
}

export default function DashboardPage(): ReactElement {
  const { t } = useT();

  // Stats LIVE (SF-10 — ordering.yaml admin stats endpoints).
  const summaryQuery = useQuery({
    queryKey: ['admin-summary'],
    queryFn: async () => (await orderingApi().adminOrdersSummary({})) as StubSummary
  });
  // revenue-by-day: contract REQUIRES from/to — mặc định 7 ngày gần nhất
  const revenueRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  }, []);
  const revenueQuery = useQuery({
    queryKey: ['admin-revenue', revenueRange.from, revenueRange.to],
    queryFn: async () =>
      (await orderingApi().adminRevenueByDay(revenueRange)) as StubRevenueDay[]
  });
  const topQuery = useQuery({
    queryKey: ['admin-top'],
    queryFn: async () => (await orderingApi().adminTopProducts({})) as {
      productId: string;
      name: string;
      qty: number;
      revenue: number;
    }[]
  });

  // Low-stock LIVE (inventory có từ SF-5) — error độc lập với charts mock.
  const lowStockQuery = useQuery({
    queryKey: ['admin-lowstock'],
    queryFn: () => inventoryApi().listLowStock({})
  });

  const summary: StubSummary | undefined = summaryQuery.data;

  const revenue7d = useMemo(() => {
    const days = revenueQuery.data ?? [];
    return days.slice(-7).reduce((sum, d) => sum + d.revenue, 0);
  }, [revenueQuery.data]);

  const aov = useMemo(() => {
    if (!summary) return 0;
    const paidOrders =
      summary.paid + summary.confirmed + summary.shipped + summary.delivered;
    return Math.round(summary.totalRevenue / Math.max(1, paidOrders));
  }, [summary]);

  const revenueData = (revenueQuery.data ?? []).map((d: StubRevenueDay) => ({
    ...d,
    label: d.date.slice(5).replace('-', '/')
  }));
  const topData = topQuery.data ?? [];

  const lowStockRows = lowStockQuery.data ?? [];

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{t('admin.dashboard.title')}</h1>
      </div>

      <div className='admin-kpi-row'>
        {summaryQuery.isLoading ? (
          <Skeleton variant='rect' height={96} count={4} />
        ) : summary !== undefined ? (
          <>
            <KpiTile label={t('admin.dashboard.revenueToday')} value={formatVnd(summary.todayRevenue)} />
            <KpiTile label={t('admin.dashboard.revenue7d')} value={formatVnd(revenue7d)} />
            <KpiTile label={t('admin.dashboard.ordersToday')} value={String(summary.todayOrders)} />
            <KpiTile label={t('admin.dashboard.aov')} value={formatVnd(aov)} />
          </>
        ) : (
          <p className='admin-error-text'>{t('admin.common.loadFail')}</p>
        )}
      </div>

      <div className='admin-chart-row'>
        <Card>
          <h3>{t('admin.dashboard.revenueChart')}</h3>
          {revenueQuery.isLoading ? (
            <Skeleton variant='rect' height={240} />
          ) : (
            <div className='admin-chart'>
              <ResponsiveContainer width='100%' height={240}>
                <LineChart data={revenueData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray='3 3' stroke='var(--c-border)' />
                  <XAxis dataKey='label' tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={axisVnd} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip
                    formatter={(value) => formatVnd(Number(value))}
                    labelFormatter={(label) => `${t('admin.common.date')}: ${label}`}
                  />
                  <Line
                    type='monotone'
                    dataKey='revenue'
                    name={t('admin.dashboard.revenue')}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h3>{t('admin.dashboard.topChart')}</h3>
          {topQuery.isLoading ? (
            <Skeleton variant='rect' height={240} />
          ) : (
            <div className='admin-chart'>
              <ResponsiveContainer width='100%' height={240}>
                <BarChart
                  data={topData}
                  layout='vertical'
                  margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray='3 3' stroke='var(--c-border)' />
                  <XAxis type='number' tickFormatter={axisVnd} tick={{ fontSize: 11 }} />
                  <YAxis
                    type='category'
                    dataKey='name'
                    width={170}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(value) => formatVnd(Number(value))} />
                  <Bar dataKey='revenue' name={t('admin.dashboard.revenue')} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3>
          {t('admin.dashboard.lowStock')}{' '}
          <Badge variant='success'>LIVE</Badge>
        </h3>
        {lowStockQuery.isLoading ? (
          <Skeleton variant='rect' height={160} />
        ) : lowStockQuery.isError ? (
          <p className='admin-error-text'>{t('admin.dashboard.lowStockFail')}</p>
        ) : lowStockRows.length === 0 ? (
          <EmptyState title={t('admin.dashboard.lowStockEmpty')} />
        ) : (
          <Table
            columns={[
              { key: 'variant', header: t('admin.dashboard.variant'), render: (row: (typeof lowStockRows)[number]) => <code>{row.variantId}</code> },
              { key: 'product', header: t('admin.dashboard.product'), render: (row: (typeof lowStockRows)[number]) => row.productName },
              {
                key: 'available',
                header: t('admin.dashboard.available'),
                align: 'right',
                render: (row: (typeof lowStockRows)[number]) => (
                  <strong style={{ color: row.available <= row.threshold ? 'var(--c-danger)' : undefined }}>
                    {row.available}
                  </strong>
                )
              },
              {
                key: 'threshold',
                header: t('admin.dashboard.threshold'),
                align: 'right',
                render: (row: (typeof lowStockRows)[number]) =>
                  row.available <= row.threshold ? (
                    <Badge variant='danger'>≤ {row.threshold}</Badge>
                  ) : (
                    <span className='admin-hint'>{row.threshold}</span>
                  )
              }
            ]}
            rows={lowStockRows}
            rowKey={(row) => `${row.productId}/${row.variantId}`}
          />
        )}
      </Card>
    </div>
  );
}
