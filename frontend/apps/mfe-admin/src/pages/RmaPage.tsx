import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Select, useToast } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { DataTable } from '../components/DataTable';
import { PageSizeSelect } from '../components/PageSizeSelect';
import { useClientSort } from '../lib/tableSort';
import type { SortAccessor } from '../lib/tableSort';
import { orderingApi } from '../lib/api';

/**
 * RmaPage (SF-14, FI-324, D22): queue duyệt trả hàng LIVE — ordering-service
 * có RMA APIs từ SF-14 (paths frozen ordering.yaml). Actions theo lifecycle:
 * REQUESTED → Duyệt / Từ chối · APPROVED → Nhận hàng · RECEIVED → Hoàn tiền
 * (server gọi payment-service refund, guard double-refund).
 */

// Types mirror runtime JSON của ordering.yaml Rma/RmaPage (types-at-call-site).
type RmaStatus = 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'REFUNDED' | 'REJECTED';

interface RmaLine {
  lineId: string;
  qty: number;
}

interface RmaRow {
  id: string;
  orderId: string;
  status: RmaStatus;
  lines: RmaLine[];
  reason: string;
  refundAmount?: number | null;
  createdAt: string;
}

interface RmaPageDto {
  items: RmaRow[];
  page: number;
  size: number;
  total: number;
}

type StatusFilter = '' | RmaStatus;
type RowAction = 'approve' | 'reject' | 'mark-received' | 'refund';

function ordering(): ReturnType<typeof orderingApi> {
  return orderingApi();
}

export default function RmaPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('REQUESTED');

  const listQuery = useQuery({
    queryKey: ['admin-rma-list', status],
    queryFn: () =>
      ordering().adminListRmas({
        ...(status ? { status: status as RmaStatus } : {}),
        page: 1
      }) as unknown as Promise<RmaPageDto>
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: RowAction }) => {
      switch (act) {
        case 'approve':
          return ordering().adminApproveRma({ id }) as unknown as Promise<RmaRow>;
        case 'reject':
          return ordering().adminRejectRma({ id }) as unknown as Promise<RmaRow>;
        case 'mark-received':
          return ordering().adminMarkRmaReceived({ id }) as unknown as Promise<RmaRow>;
        case 'refund':
          return ordering().adminRefundRma({ id }) as unknown as Promise<RmaRow>;
      }
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-rma-list'] });
      const doneKey: Record<RowAction, string> = {
        approve: 'admin.rma.approveDone',
        reject: 'admin.rma.rejectDone',
        'mark-received': 'admin.rma.markReceivedDone',
        refund: 'admin.rma.refundDone'
      };
      toast.toast(t(doneKey[vars.act]), { variant: 'success' });
    },
    onError: (error) => toast.toast(String(error), { variant: 'danger' })
  });

  const rows = listQuery.data?.items ?? [];

  // Load-all → sort client (useClientSort) rồi slice trang hiện tại
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sort, sortedRows, toggleSort } = useClientSort<RmaRow>(rows);
  const onSortToggle = (key: string, accessor: SortAccessor<RmaRow>): void => {
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
      key: 'id',
      header: t('admin.rma.colId'),
      sortValue: (row: RmaRow) => row.id,
      render: (row: RmaRow) => (
        <code data-testid={`rma-id-${row.id.slice(0, 8).toLowerCase()}`}>
          #{row.id.slice(0, 8).toUpperCase()}
        </code>
      )
    },
    {
      key: 'orderId',
      header: t('admin.rma.colOrder'),
      render: (row: RmaRow) => (
        <code>#{row.orderId.slice(0, 8).toUpperCase()}</code>
      )
    },
    {
      key: 'status',
      header: t('admin.common.status'),
      sortValue: (row: RmaRow) => row.status,
      render: (row: RmaRow) => (
        <Badge
          variant={
            row.status === 'REFUNDED'
              ? 'success'
              : row.status === 'REJECTED'
                ? 'danger'
                : row.status === 'REQUESTED'
                  ? 'warning'
                  : 'neutral'
          }
        >
          {t(`admin.status.${row.status}`)}
        </Badge>
      )
    },
    { key: 'reason', header: t('admin.rma.colReason'), render: (row: RmaRow) => row.reason },
    {
      key: 'lines',
      header: t('admin.rma.colItems'),
      render: (row: RmaRow) => `${row.lines.length} dòng · ${row.lines.reduce((s, l) => s + l.qty, 0)} món`
    },
    {
      key: 'createdAt',
      header: t('admin.common.date'),
      sortValue: (row: RmaRow) => row.createdAt,
      render: (row: RmaRow) => new Date(row.createdAt).toLocaleString('vi-VN')
    },
    {
      key: 'actions',
      header: t('admin.common.actions'),
      render: (row: RmaRow) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {row.status === 'REQUESTED' && (
            <>
              <Button
                size="sm"
                variant="primary"
                data-testid={`rma-approve-${row.id.slice(0, 8).toLowerCase()}`}
                onClick={() => action.mutate({ id: row.id, act: 'approve' })}
              >
                {t('admin.rma.approve')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => action.mutate({ id: row.id, act: 'reject' })}
              >
                {t('admin.rma.reject')}
              </Button>
            </>
          )}
          {row.status === 'APPROVED' && (
            <Button
              size="sm"
              variant="secondary"
              data-testid={`rma-received-${row.id.slice(0, 8).toLowerCase()}`}
              onClick={() => action.mutate({ id: row.id, act: 'mark-received' })}
            >
              {t('admin.rma.markReceived')}
            </Button>
          )}
          {row.status === 'RECEIVED' && (
            <Button
              size="sm"
              variant="primary"
              data-testid={`rma-refund-${row.id.slice(0, 8).toLowerCase()}`}
              onClick={() => action.mutate({ id: row.id, act: 'refund' })}
            >
              {t('admin.rma.refund')}
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="admin-page-head">
        <h1>{t('admin.rma.title')}</h1>
        <div className="admin-page-head__actions">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label={t('admin.common.status')}
          >
            <option value="">{t('admin.common.all')}</option>
            <option value="REQUESTED">{t('admin.status.REQUESTED')}</option>
            <option value="APPROVED">{t('admin.status.APPROVED')}</option>
            <option value="RECEIVED">{t('admin.status.RECEIVED')}</option>
            <option value="REFUNDED">{t('admin.status.REFUNDED')}</option>
            <option value="REJECTED">{t('admin.status.REJECTED')}</option>
          </Select>
        </div>
      </div>

      {listQuery.isLoading ? (
        <DataTable loading columns={columns} rows={[]} />
      ) : listQuery.isError ? (
        <p className="admin-error-text">{t('admin.common.loadFail')}</p>
      ) : (
        <>
          <DataTable<RmaRow>
            columns={columns}
            rows={pagedRows}
            rowKey={(row) => row.id}
            empty={t('admin.rma.empty')}
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
