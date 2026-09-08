import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authStore } from '@ecommerce/auth';
import {
  createAffiliateClient,
  executeRequest,
  type AffiliateClient,
  type ApiClientOptions,
  type RouteDef,
} from '@ecommerce/contracts';
import { useT } from '@ecommerce/i18n';
import { Badge, Button, Card, Input, Select, useToast, formatPrice } from '@ecommerce/ui-kit';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { useClientSort } from '../lib/tableSort';
import type { SortAccessor } from '../lib/tableSort';

/**
 * AffiliatesPage (SF-12 — D20): quản lý affiliate LIVE (affiliate-service có
 * từ SF-12 — không stub như reviews/orders). Duyệt/từ chối hồ sơ PENDING,
 * suspend/reactivate (acceptance pack: suspend → link ngừng track), sửa rate
 * % (áp cho đơn SAU — ledger cũ giữ rate cũ), stats mini theo contract
 * /admin/stats.
 *
 * suspend/reactivate là endpoint ADDITIVE (không nằm trong affiliate.yaml
 * frozen — requiremen-gap FI-310) → gọi qua executeRequest với RouteDef cục
 * bộ, KHÔNG sửa packages/contracts. Client tạo CỤC BỘ tại page (file-slice
 * SF-12 — không đụng lib/api.ts của SF-7).
 */

// Types mirror runtime JSON của contracts/openapi/affiliate.yaml (pattern
// types-at-call-site — packages/contracts không export schema types).
interface AffiliateStats {
  clicks: number;
  conversions: number;
  earnings: number;
}

interface AffiliateProfileRow {
  id: string;
  code: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rate: number;
  stats: AffiliateStats;
}

interface AffiliateProfilePageDto {
  items: AffiliateProfileRow[];
  page: number;
  size: number;
  total: number;
}

interface AdminStats {
  totalAffiliates: number;
  activeClicks: number;
  conversions: number;
  totalCommission: number;
}

function affiliateApi(): AffiliateClient {
  const options: ApiClientOptions = {
    baseURL: authStore.getConfig().identityBaseUrl ?? '',
    getToken: () => authStore.getToken(),
    // 401 → single-flight refresh → retry (AuthStore.fetch).
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
  return createAffiliateClient(options);
}

/** RouteDef additive cho suspend/reactivate — cùng runtime client chuẩn. */
const SUSPEND_ROUTE: RouteDef = ['POST', '/api/affiliate/admin/affiliates/{id}/suspend'];
const REACTIVATE_ROUTE: RouteDef = ['POST', '/api/affiliate/admin/affiliates/{id}/reactivate'];

function affiliateOptions(): ApiClientOptions {
  return {
    baseURL: authStore.getConfig().identityBaseUrl ?? '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

type StatusFilter = '' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
type RowAction = 'approve' | 'reject' | 'suspend' | 'reactivate';

export default function AffiliatesPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateValue, setRateValue] = useState('');

  const statsQuery = useQuery({
    queryKey: ['affiliate-admin-stats'],
    queryFn: () => affiliateApi().getAffiliateStats({}) as unknown as Promise<AdminStats>
  });

  const listQuery = useQuery({
    queryKey: ['affiliate-admin-list', status],
    queryFn: () =>
      affiliateApi().listAffiliates({
        // SUSPENDED là status additive (ngoài enum contract) — cast có chủ đích
        ...(status
          ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' }
          : {}),
        page: 1
      }) as unknown as Promise<AffiliateProfilePageDto>
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['affiliate-admin-list'] });
    void queryClient.invalidateQueries({ queryKey: ['affiliate-admin-stats'] });
  };

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: RowAction }) => {
      switch (act) {
        case 'approve':
          return affiliateApi().approveAffiliate({ id }) as unknown as Promise<AffiliateProfileRow>;
        case 'reject':
          return affiliateApi().rejectAffiliate({ id }) as unknown as Promise<AffiliateProfileRow>;
        case 'suspend':
          return executeRequest(affiliateOptions(), SUSPEND_ROUTE, { id }) as unknown as Promise<AffiliateProfileRow>;
        case 'reactivate':
          return executeRequest(affiliateOptions(), REACTIVATE_ROUTE, { id }) as unknown as Promise<AffiliateProfileRow>;
      }
    },
    onSuccess: (_data, vars) => {
      invalidate();
      toast.toast(t(`admin.affiliates.${vars.act}Done`), { variant: 'success' });
    },
    onError: (error) => toast.toast(String(error), { variant: 'danger' })
  });

  const updateRate = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) =>
      affiliateApi().updateAffiliateRate({ id, rate }) as unknown as Promise<AffiliateProfileRow>,
    onSuccess: () => {
      invalidate();
      toast.toast(t('admin.common.saved'), { variant: 'success' });
      setEditingRate(null);
    },
    onError: (error) => toast.toast(String(error), { variant: 'danger' })
  });

  const rows = listQuery.data?.items ?? [];

  // Load-all → sort client (useClientSort) rồi slice trang hiện tại
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sort, sortedRows, toggleSort } = useClientSort<AffiliateProfileRow>(rows);
  const onSortToggle = (key: string, accessor: SortAccessor<AffiliateProfileRow>): void => {
    setPage(1);
    toggleSort(key, accessor);
  };
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize]
  );

  const columns = [
    {
      key: 'code',
      header: t('admin.affiliates.colCode'),
      sortValue: (row: AffiliateProfileRow) => row.code,
      render: (row: AffiliateProfileRow) =>
        row.code ? (
          <code style={{ fontWeight: 700, letterSpacing: 2 }}>{row.code}</code>
        ) : (
          <span className="admin-hint">—</span>
        )
    },
    {
      key: 'status',
      header: t('admin.common.status'),
      render: (row: AffiliateProfileRow) => (
        <Badge
          variant={
            row.status === 'APPROVED'
              ? 'success'
              : row.status === 'PENDING'
                ? 'warning'
                : 'danger'
          }
        >
          {t(`admin.status.${row.status}`)}
        </Badge>
      )
    },
    {
      key: 'rate',
      header: t('admin.affiliates.colRate'),
      sortValue: (row: AffiliateProfileRow) => row.rate,
      render: (row: AffiliateProfileRow) =>
        editingRate === row.id ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Input
              type="number"
              value={rateValue}
              min={0.1}
              max={50}
              step={0.5}
              onChange={(e) => setRateValue(e.target.value)}
              aria-label={t('admin.affiliates.colRate')}
            />
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const rate = Number(rateValue);
                if (rate > 0 && rate <= 50) {
                  updateRate.mutate({ id: row.id, rate });
                } else {
                  toast.toast(t('admin.affiliates.rateInvalid'), { variant: 'danger' });
                }
              }}
            >
              {t('admin.common.save')}
            </Button>
          </span>
        ) : (
          <button
            onClick={() => {
              setEditingRate(row.id);
              setRateValue(String(row.rate));
            }}
            title={t('admin.affiliates.rateEditHint')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--c-primary, #ee2624)',
              textDecoration: 'underline',
              padding: 0,
              font: 'inherit'
            }}
          >
            {row.rate}%
          </button>
        )
    },
    {
      key: 'clicks',
      header: t('admin.affiliates.colClicks'),
      sortValue: (row: AffiliateProfileRow) => row.stats.clicks,
      render: (row: AffiliateProfileRow) => row.stats.clicks
    },
    {
      key: 'conversions',
      header: t('admin.affiliates.colConversions'),
      sortValue: (row: AffiliateProfileRow) => row.stats.conversions,
      render: (row: AffiliateProfileRow) => row.stats.conversions
    },
    {
      key: 'earnings',
      header: t('admin.affiliates.colEarnings'),
      sortValue: (row: AffiliateProfileRow) => row.stats.earnings,
      render: (row: AffiliateProfileRow) => formatPrice(row.stats.earnings)
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: AffiliateProfileRow) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {row.status === 'PENDING' ? (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => action.mutate({ id: row.id, act: 'approve' })}
              >
                {t('admin.affiliates.approve')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => action.mutate({ id: row.id, act: 'reject' })}
              >
                {t('admin.affiliates.reject')}
              </Button>
            </>
          ) : row.status === 'APPROVED' ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => action.mutate({ id: row.id, act: 'suspend' })}
            >
              {t('admin.affiliates.suspend')}
            </Button>
          ) : row.status === 'SUSPENDED' ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => action.mutate({ id: row.id, act: 'reactivate' })}
            >
              {t('admin.affiliates.reactivate')}
            </Button>
          ) : null}
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="admin-page-head">
        <h1>{t('admin.affiliates.title')}</h1>
        <div className="admin-page-head__actions">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label={t('admin.common.status')}
          >
            <option value="">{t('admin.common.all')}</option>
            <option value="PENDING">{t('admin.status.PENDING')}</option>
            <option value="APPROVED">{t('admin.status.APPROVED')}</option>
            <option value="REJECTED">{t('admin.status.REJECTED')}</option>
            <option value="SUSPENDED">{t('admin.status.SUSPENDED')}</option>
          </Select>
        </div>
      </div>

      {/* Stats mini (contract /admin/stats) */}
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          marginBottom: 16
        }}
      >
        <Card>
          <p className="admin-hint">{t('admin.affiliates.statTotal')}</p>
          <h2 style={{ margin: 0 }} data-testid="affiliates-stat-total">
            {statsQuery.data?.totalAffiliates ?? '—'}
          </h2>
        </Card>
        <Card>
          <p className="admin-hint">{t('admin.affiliates.statClicks')}</p>
          <h2 style={{ margin: 0 }}>{statsQuery.data?.activeClicks ?? '—'}</h2>
        </Card>
        <Card>
          <p className="admin-hint">{t('admin.affiliates.statConversions')}</p>
          <h2 style={{ margin: 0 }}>{statsQuery.data?.conversions ?? '—'}</h2>
        </Card>
        <Card>
          <p className="admin-hint">{t('admin.affiliates.statCommission')}</p>
          <h2 style={{ margin: 0 }}>
            {statsQuery.data ? formatPrice(statsQuery.data.totalCommission) : '—'}
          </h2>
        </Card>
      </div>

      {listQuery.isLoading ? (
        <DataTable loading columns={columns} rows={[]} />
      ) : listQuery.isError ? (
        <p className="admin-error-text">{t('admin.common.loadFail')}</p>
      ) : (
        <>
          <DataTable<AffiliateProfileRow>
            columns={columns}
            rows={pagedRows}
            rowKey={(row) => row.id}
            empty={t('admin.affiliates.empty')}
            caption={t('admin.common.total', { count: listQuery.data?.total ?? 0 })}
            sort={sort}
            onSortToggle={onSortToggle}
          />
          <div className="admin-pagination">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPage(1);
                setPageSize(n);
              }}
              label={t('admin.common.pageSize')}
            />
            <span>
              {t('admin.common.pageOf', { page, total: totalPages })} —{' '}
              {t('admin.common.total', { count: rows.length })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
